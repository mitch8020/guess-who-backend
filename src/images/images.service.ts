import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { imageSize } from 'image-size';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MATCH_MIN_IMAGES,
  MAX_UPLOAD_MB,
} from '../common/constants';
import { RequestPrincipal, RoomImageRecord } from '../common/types/domain.types';
import { sha256, createId } from '../common/utils/crypto.util';
import { detectImageMimeType } from '../common/utils/image-signature.util';
import { RealtimeService } from '../realtime/realtime.service';
import { InMemoryStore } from '../store/in-memory.store';
import { RoomsService } from '../rooms/rooms.service';

@Injectable()
export class ImagesService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly roomsService: RoomsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  uploadImage(
    roomId: string,
    principal: RequestPrincipal,
    file: Express.Multer.File | undefined,
  ): RoomImageRecord {
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

    this.roomsService.getRoomById(roomId);
    const member = this.roomsService.ensureActiveMember(roomId, principal);

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
    const duplicate = [...this.store.images.values()].find(
      (image) => image.roomId === roomId && image.sha256 === digest && image.isActive,
    );
    if (duplicate) {
      throw new BadRequestException({
        code: 'IMAGE_DUPLICATE',
        message: 'Duplicate image already exists in this room.',
        details: { imageId: duplicate._id },
      });
    }

    const dimensions = imageSize(file.buffer);
    const imageRecord: RoomImageRecord = {
      _id: createId(),
      roomId,
      uploaderMemberId: member._id,
      storageFileId: createId(),
      filename: file.originalname,
      mimeType: file.mimetype,
      width: dimensions.width ?? 0,
      height: dimensions.height ?? 0,
      fileSizeBytes: file.size,
      sha256: digest,
      isActive: true,
      createdAt: new Date(),
    };

    this.store.images.set(imageRecord._id, imageRecord);
    this.store.imageBuffers.set(imageRecord.storageFileId, file.buffer);
    this.roomsService.touchRoomActivity(roomId);
    this.realtimeService.publishRoomUpdate(roomId, 'image.added', {
      roomId,
      imageId: imageRecord._id,
      uploaderMemberId: member._id,
    });

    return imageRecord;
  }

  listImages(roomId: string, principal: RequestPrincipal): {
    images: RoomImageRecord[];
    activeCount: number;
    minRequiredToStart: number;
  } {
    this.roomsService.ensureActiveMember(roomId, principal);
    const images = [...this.store.images.values()].filter(
      (image) => image.roomId === roomId && image.isActive,
    );
    return {
      images,
      activeCount: images.length,
      minRequiredToStart: MATCH_MIN_IMAGES,
    };
  }

  deleteImage(roomId: string, imageId: string, principal: RequestPrincipal): void {
    this.roomsService.getRoomById(roomId);
    const member = this.roomsService.ensureActiveMember(roomId, principal);
    const image = this.store.images.get(imageId);
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

    image.isActive = false;
    this.store.images.set(imageId, image);
    this.roomsService.touchRoomActivity(roomId);
    this.realtimeService.publishRoomUpdate(roomId, 'image.removed', {
      roomId,
      imageId,
      actorMemberId: member._id,
    });
  }
}
