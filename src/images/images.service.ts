import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { imageSize } from 'image-size';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MATCH_MIN_IMAGES,
  MAX_UPLOAD_MB,
} from '../common/constants';
import { GridFsService } from '../common/persistence/gridfs.service';
import { MODEL_NAMES, RoomImageDocument } from '../common/schemas/persistence.schemas';
import { RequestPrincipal, RoomImageRecord } from '../common/types/domain.types';
import { sha256, createId } from '../common/utils/crypto.util';
import { detectImageMimeType } from '../common/utils/image-signature.util';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsService } from '../rooms/rooms.service';

@Injectable()
export class ImagesService {
  constructor(
    @InjectModel(MODEL_NAMES.RoomImage)
    private readonly roomImageModel: Model<RoomImageDocument>,
    private readonly gridFsService: GridFsService,
    private readonly roomsService: RoomsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async uploadImage(
    roomId: string,
    principal: RequestPrincipal,
    file: Express.Multer.File | undefined,
  ): Promise<RoomImageRecord> {
    if (!file) {
      throw new BadRequestException({
        code: 'IMAGE_FILE_REQUIRED',
        message: 'A multipart image file is required.',
        details: {},
      });
    }

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new BadRequestException({
        code: 'IMAGE_TOO_LARGE',
        message: `Image exceeds ${MAX_UPLOAD_MB} MB upload limit.`,
        details: {},
      });
    }

    await this.roomsService.getRoomById(roomId);
    const member = await this.roomsService.ensureActiveMember(roomId, principal);

    const detectedMime = detectImageMimeType(file.buffer);
    if (!detectedMime || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMime)) {
      throw new BadRequestException({
        code: 'IMAGE_SIGNATURE_INVALID',
        message: 'Uploaded file is not a supported image format.',
        details: {},
      });
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'IMAGE_MIME_INVALID',
        message: 'Only JPEG, PNG, and WebP files are supported.',
        details: {},
      });
    }

    const digest = sha256(file.buffer);
    const duplicate = await this.roomImageModel
      .findOne({ roomId, sha256: digest, isActive: true })
      .lean<RoomImageRecord>()
      .exec();

    if (duplicate) {
      throw new BadRequestException({
        code: 'IMAGE_DUPLICATE',
        message: 'Duplicate image already exists in this room.',
        details: { imageId: duplicate._id },
      });
    }

    const dimensions = imageSize(file.buffer);
    const storageFileId = await this.gridFsService.uploadBuffer(file.buffer, file.originalname, file.mimetype, {
      roomId,
      uploaderMemberId: member._id,
    });

    const imageRecord: RoomImageRecord = {
      _id: createId(),
      roomId,
      uploaderMemberId: member._id,
      storageFileId,
      filename: file.originalname,
      mimeType: file.mimetype,
      width: dimensions.width ?? 0,
      height: dimensions.height ?? 0,
      fileSizeBytes: file.size,
      sha256: digest,
      isActive: true,
      createdAt: new Date(),
    };

    await this.roomImageModel.create(imageRecord);
    await this.roomsService.touchRoomActivity(roomId);
    this.realtimeService.publishRoomUpdate(roomId, 'image.added', {
      roomId,
      imageId: imageRecord._id,
      uploaderMemberId: member._id,
    });

    return imageRecord;
  }

  async listImages(
    roomId: string,
    principal: RequestPrincipal,
  ): Promise<{
    images: RoomImageRecord[];
    activeCount: number;
    minRequiredToStart: number;
  }> {
    await this.roomsService.ensureActiveMember(roomId, principal);
    const images = await this.roomImageModel
      .find({ roomId, isActive: true })
      .lean<RoomImageRecord[]>()
      .exec();

    return {
      images,
      activeCount: images.length,
      minRequiredToStart: MATCH_MIN_IMAGES,
    };
  }

  async deleteImage(roomId: string, imageId: string, principal: RequestPrincipal): Promise<void> {
    await this.roomsService.getRoomById(roomId);
    const member = await this.roomsService.ensureActiveMember(roomId, principal);
    const image = await this.roomImageModel
      .findById(imageId)
      .lean<RoomImageRecord>()
      .exec();

    if (!image || image.roomId !== roomId || !image.isActive) {
      throw new NotFoundException({
        code: 'IMAGE_NOT_FOUND',
        message: 'Image was not found.',
        details: {},
      });
    }

    const isHost = member.role === 'host';
    const isUploader = member._id === image.uploaderMemberId;
    if (!isHost && !isUploader) {
      throw new ForbiddenException({
        code: 'IMAGE_DELETE_FORBIDDEN',
        message: 'Only host or uploader can delete this image.',
        details: {},
      });
    }

    await this.roomImageModel
      .updateOne({ _id: imageId }, { $set: { isActive: false } })
      .exec();
    await this.gridFsService.deleteById(image.storageFileId);

    await this.roomsService.touchRoomActivity(roomId);
    this.realtimeService.publishRoomUpdate(roomId, 'image.removed', {
      roomId,
      imageId,
      actorMemberId: member._id,
    });
  }

  async bulkRemoveImages(
    roomId: string,
    principal: RequestPrincipal,
    imageIds: string[],
  ): Promise<{ removedImageIds: string[] }> {
    const member = await this.roomsService.ensureHostMember(roomId, principal);
    const images = await this.roomImageModel
      .find({ _id: { $in: imageIds }, roomId, isActive: true })
      .lean<RoomImageRecord[]>()
      .exec();

    if (images.length === 0) {
      return { removedImageIds: [] };
    }

    const resolvedIds = images.map((image) => image._id);
    await this.roomImageModel
      .updateMany({ _id: { $in: resolvedIds } }, { $set: { isActive: false } })
      .exec();

    await Promise.all(images.map((image) => this.gridFsService.deleteById(image.storageFileId)));

    this.realtimeService.publishRoomUpdate(roomId, 'images.bulk_removed', {
      roomId,
      actorMemberId: member._id,
      imageIds: resolvedIds,
    });

    return { removedImageIds: resolvedIds };
  }
}
