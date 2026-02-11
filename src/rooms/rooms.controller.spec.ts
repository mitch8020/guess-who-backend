import { UnauthorizedException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';

describe('RoomsController', () => {
  const roomsService = {
    createRoom: jest.fn(() => Promise.resolve({ room: { _id: 'room-1' } })),
    listRoomsForUser: jest.fn(() => Promise.resolve([{ _id: 'room-1' }])),
    getRoomDetailForPrincipal: jest.fn(() =>
      Promise.resolve({ room: { _id: 'room-1' } }),
    ),
    updateRoom: jest.fn(() =>
      Promise.resolve({ _id: 'room-1', name: 'Updated' }),
    ),
    archiveRoom: jest.fn(() => Promise.resolve(undefined)),
    removeMember: jest.fn(() => Promise.resolve([{ _id: 'member-1' }])),
    muteMember: jest.fn(() =>
      Promise.resolve({ _id: 'member-2', mutedUntil: new Date() }),
    ),
    unmuteMember: jest.fn(() => Promise.resolve({ _id: 'member-2' })),
  };
  const realtimeService = {
    publishRoomUpdate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires user principal for user-scoped actions', async () => {
    const controller = new RoomsController(
      roomsService as any,
      realtimeService as any,
    );

    expect(() =>
      controller.createRoom({ name: 'Room', type: 'temporary' }, undefined),
    ).toThrow(UnauthorizedException);
    await expect(controller.listRooms(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      controller.updateRoom('room-1', { name: 'x' }, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.archiveRoom('room-1', undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.removeMember('room-1', { memberId: 'member-1' }, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.muteMember(
        'room-1',
        'member-2',
        { durationMinutes: 10 },
        undefined,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.unmuteMember('room-1', 'member-2', undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires any principal for room detail route', async () => {
    const controller = new RoomsController(
      roomsService as any,
      realtimeService as any,
    );
    await expect(
      controller.getRoomDetail('room-1', undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('delegates room operations and publishes mute/unmute updates', async () => {
    const controller = new RoomsController(
      roomsService as any,
      realtimeService as any,
    );
    const userPrincipal = { kind: 'user' as const, userId: 'user-1' };
    const guestPrincipal = {
      kind: 'guest' as const,
      roomId: 'room-1',
      memberId: 'member-1',
      displayName: 'Guest',
    };

    await expect(
      controller.createRoom({ name: 'Room', type: 'temporary' }, userPrincipal),
    ).resolves.toEqual({ room: { _id: 'room-1' } });
    await expect(controller.listRooms(userPrincipal)).resolves.toEqual({
      rooms: [{ _id: 'room-1' }],
    });
    await expect(
      controller.getRoomDetail('room-1', guestPrincipal),
    ).resolves.toEqual({
      room: { _id: 'room-1' },
    });
    await expect(
      controller.updateRoom('room-1', { name: 'Updated' }, userPrincipal),
    ).resolves.toEqual({
      room: { _id: 'room-1', name: 'Updated' },
    });
    await expect(
      controller.removeMember(
        'room-1',
        { memberId: 'member-1' },
        userPrincipal,
      ),
    ).resolves.toEqual({
      members: [{ _id: 'member-1' }],
    });
    await expect(
      controller.muteMember(
        'room-1',
        'member-2',
        { durationMinutes: 15 },
        userPrincipal,
      ),
    ).resolves.toEqual({
      member: expect.objectContaining({ _id: 'member-2' }),
    });
    await expect(
      controller.unmuteMember('room-1', 'member-2', userPrincipal),
    ).resolves.toEqual({
      member: { _id: 'member-2' },
    });
    expect(realtimeService.publishRoomUpdate).toHaveBeenCalledTimes(2);
  });
});
