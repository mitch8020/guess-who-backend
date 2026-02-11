import { UnauthorizedException } from '@nestjs/common';
import { ImagesController } from './images.controller';

describe('ImagesController', () => {
  const principal = { kind: 'user' as const, userId: 'user-1' };

  it('requires principal for uploads', async () => {
    const imagesService = {
      uploadImage: jest.fn(),
      listImages: jest.fn(),
      deleteImage: jest.fn(),
      bulkRemoveImages: jest.fn(),
    };
    const controller = new ImagesController(imagesService as any);

    expect(() => controller.upload('room-1', undefined, undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('maps successful upload result', async () => {
    const imagesService = {
      uploadImage: jest.fn(() => Promise.resolve({ _id: 'image-1' })),
      listImages: jest.fn(),
      deleteImage: jest.fn(),
      bulkRemoveImages: jest.fn(),
    };
    const controller = new ImagesController(imagesService as any);

    await expect(
      controller.upload('room-1', principal, {
        buffer: Buffer.from('x'),
      } as any),
    ).resolves.toEqual({ image: { _id: 'image-1' } });
  });

  it('requires principal for list/remove/bulk-remove', async () => {
    const imagesService = {
      uploadImage: jest.fn(),
      listImages: jest.fn(),
      deleteImage: jest.fn(),
      bulkRemoveImages: jest.fn(),
    };
    const controller = new ImagesController(imagesService as any);

    expect(() => controller.list('room-1', undefined)).toThrow(
      UnauthorizedException,
    );
    await expect(
      controller.remove('room-1', 'image-1', undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(() =>
      controller.bulkRemove('room-1', undefined, { imageIds: ['a'] }),
    ).toThrow(UnauthorizedException);
  });

  it('delegates list/remove/bulk remove operations', async () => {
    const imagesService = {
      uploadImage: jest.fn(),
      listImages: jest.fn(() =>
        Promise.resolve({ images: [], activeCount: 0, minRequiredToStart: 16 }),
      ),
      deleteImage: jest.fn(() => Promise.resolve(undefined)),
      bulkRemoveImages: jest.fn(() =>
        Promise.resolve({ removedImageIds: ['a', 'b'] }),
      ),
    };
    const controller = new ImagesController(imagesService as any);

    await expect(controller.list('room-1', principal)).resolves.toEqual({
      images: [],
      activeCount: 0,
      minRequiredToStart: 16,
    });
    await expect(
      controller.remove('room-1', 'image-1', principal),
    ).resolves.toBeUndefined();
    await expect(
      controller.bulkRemove('room-1', principal, { imageIds: ['a', 'b'] }),
    ).resolves.toEqual({ removedImageIds: ['a', 'b'] });
  });
});
