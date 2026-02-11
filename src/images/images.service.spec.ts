import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { imageSize } from 'image-size';
import { detectImageMimeType } from '../common/utils/image-signature.util';
import { ImagesService } from './images.service';

jest.mock('image-size', () => ({
  imageSize: jest.fn(() => ({ width: 100, height: 80 })),
}));

jest.mock('../common/utils/image-signature.util', () => ({
  detectImageMimeType: jest.fn(() => 'image/jpeg'),
}));

const leanExec = <T>(value: T) => ({
  lean: () => ({
    exec: () => Promise.resolve(value),
  }),
});

describe('ImagesService', () => {
  const principal = { kind: 'user' as const, userId: 'user-1' };
  const member = { _id: 'member-1', role: 'player' };

  const buildService = () => {
    const roomImageModel = {
      findOne: jest.fn(() => leanExec(null)),
      create: jest.fn(() => Promise.resolve(undefined)),
      find: jest.fn(() => leanExec([])),
      findById: jest.fn(() => leanExec(null)),
      updateOne: jest.fn(() => ({ exec: () => Promise.resolve(undefined) })),
      updateMany: jest.fn(() => ({ exec: () => Promise.resolve(undefined) })),
    };
    const gridFsService = {
      uploadBuffer: jest.fn(() => Promise.resolve('storage-1')),
      deleteById: jest.fn(() => Promise.resolve(undefined)),
    };
    const roomsService = {
      getRoomById: jest.fn(() => Promise.resolve({ _id: 'room-1' })),
      ensureActiveMember: jest.fn(() => Promise.resolve(member)),
      ensureHostMember: jest.fn(() => Promise.resolve({ _id: 'host-1' })),
      touchRoomActivity: jest.fn(() => Promise.resolve(undefined)),
    };
    const realtimeService = {
      publishRoomUpdate: jest.fn(),
    };

    return {
      service: new ImagesService(
        roomImageModel as any,
        gridFsService as any,
        roomsService as any,
        realtimeService as any,
      ),
      roomImageModel,
      gridFsService,
      roomsService,
      realtimeService,
    };
  };

  const file = (): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'cat.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024,
      destination: '',
      filename: '',
      path: '',
      stream: undefined as never,
      buffer: Buffer.from('not-real-jpeg'),
    }) as Express.Multer.File;

  afterEach(() => {
    jest.clearAllMocks();
    (detectImageMimeType as jest.Mock).mockReturnValue('image/jpeg');
    (imageSize as jest.Mock).mockReturnValue({ width: 100, height: 80 });
  });

  it('requires an upload file', async () => {
    const { service } = buildService();

    await expect(
      service.uploadImage('room-1', principal, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported image signatures', async () => {
    const { service } = buildService();
    (detectImageMimeType as jest.Mock).mockReturnValueOnce(null);

    await expect(
      service.uploadImage('room-1', principal, file()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects mismatched mime types', async () => {
    const { service } = buildService();

    await expect(
      service.uploadImage('room-1', principal, {
        ...file(),
        mimetype: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate active images', async () => {
    const { service, roomImageModel } = buildService();
    roomImageModel.findOne.mockReturnValueOnce(
      leanExec({
        _id: 'image-1',
        roomId: 'room-1',
        isActive: true,
      }),
    );

    await expect(
      service.uploadImage('room-1', principal, file()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uploads and publishes image updates', async () => {
    const {
      service,
      roomImageModel,
      gridFsService,
      roomsService,
      realtimeService,
    } = buildService();

    const image = await service.uploadImage('room-1', principal, file());

    expect(image.storageFileId).toBe('storage-1');
    expect(image.mimeType).toBe('image/jpeg');
    expect(imageSize).toHaveBeenCalled();
    expect(gridFsService.uploadBuffer).toHaveBeenCalled();
    expect(roomImageModel.create).toHaveBeenCalled();
    expect(roomsService.touchRoomActivity).toHaveBeenCalledWith('room-1');
    expect(realtimeService.publishRoomUpdate).toHaveBeenCalledWith(
      'room-1',
      'image.added',
      expect.objectContaining({
        roomId: 'room-1',
      }),
    );
  });

  it('lists active images and counts', async () => {
    const { service, roomImageModel } = buildService();
    roomImageModel.find.mockReturnValueOnce(
      leanExec([
        { _id: 'image-1', roomId: 'room-1', isActive: true },
        { _id: 'image-2', roomId: 'room-1', isActive: true },
      ]),
    );

    const result = await service.listImages('room-1', principal);
    expect(result.activeCount).toBe(2);
    expect(result.images).toHaveLength(2);
  });

  it('throws not found for missing image delete target', async () => {
    const { service } = buildService();

    await expect(
      service.deleteImage('room-1', 'missing', principal),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prevents non-host non-uploader from deleting image', async () => {
    const { service, roomImageModel } = buildService();
    roomImageModel.findById.mockReturnValueOnce(
      leanExec({
        _id: 'image-1',
        roomId: 'room-1',
        uploaderMemberId: 'member-other',
        storageFileId: 'storage-1',
        isActive: true,
      }),
    );

    await expect(
      service.deleteImage('room-1', 'image-1', principal),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deletes image and publishes update when allowed', async () => {
    const {
      service,
      roomImageModel,
      gridFsService,
      roomsService,
      realtimeService,
    } = buildService();
    roomsService.ensureActiveMember.mockResolvedValueOnce({
      _id: 'host-1',
      role: 'host',
    });
    roomImageModel.findById.mockReturnValueOnce(
      leanExec({
        _id: 'image-1',
        roomId: 'room-1',
        uploaderMemberId: 'member-1',
        storageFileId: 'storage-1',
        isActive: true,
      }),
    );

    await service.deleteImage('room-1', 'image-1', principal);

    expect(roomImageModel.updateOne).toHaveBeenCalled();
    expect(gridFsService.deleteById).toHaveBeenCalledWith('storage-1');
    expect(roomsService.touchRoomActivity).toHaveBeenCalledWith('room-1');
    expect(realtimeService.publishRoomUpdate).toHaveBeenCalledWith(
      'room-1',
      'image.removed',
      expect.objectContaining({ imageId: 'image-1' }),
    );
  });

  it('bulk remove returns empty when no images resolve', async () => {
    const { service } = buildService();

    await expect(
      service.bulkRemoveImages('room-1', principal, ['a', 'b']),
    ).resolves.toEqual({ removedImageIds: [] });
  });

  it('bulk remove deactivates images and deletes blobs', async () => {
    const { service, roomImageModel, gridFsService, realtimeService } =
      buildService();
    roomImageModel.find.mockReturnValueOnce(
      leanExec([
        {
          _id: 'img-1',
          roomId: 'room-1',
          storageFileId: 'storage-1',
          isActive: true,
        },
        {
          _id: 'img-2',
          roomId: 'room-1',
          storageFileId: 'storage-2',
          isActive: true,
        },
      ]),
    );

    const result = await service.bulkRemoveImages('room-1', principal, [
      'img-1',
      'img-2',
      'img-3',
    ]);

    expect(result).toEqual({ removedImageIds: ['img-1', 'img-2'] });
    expect(roomImageModel.updateMany).toHaveBeenCalled();
    expect(gridFsService.deleteById).toHaveBeenCalledTimes(2);
    expect(realtimeService.publishRoomUpdate).toHaveBeenCalledWith(
      'room-1',
      'images.bulk_removed',
      expect.objectContaining({
        imageIds: ['img-1', 'img-2'],
      }),
    );
  });
});
