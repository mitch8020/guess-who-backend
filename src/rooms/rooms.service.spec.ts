import { RoomsService } from './rooms.service';

const leanExec = <T>(value: T) => ({
  lean: () => ({
    exec: () => Promise.resolve(value),
  }),
});

describe('RoomsService', () => {
  const configService = {
    get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
  };

  it('blocks reactivation for kicked members', async () => {
    const roomModel = {
      updateOne: jest.fn(),
    };
    const roomMemberModel = {
      findOne: jest.fn(() =>
        leanExec({
          _id: 'member-1',
          roomId: 'room-1',
          userId: 'user-1',
          displayName: 'Player',
          role: 'player',
          status: 'kicked',
          joinedAt: new Date(),
          lastSeenAt: new Date(),
        }),
      ),
      updateOne: jest.fn(),
      create: jest.fn(),
    };
    const matchModel = {
      countDocuments: jest.fn(),
    };

    const service = new RoomsService(
      roomModel as any,
      roomMemberModel as any,
      matchModel as any,
      configService as any,
    );

    await expect(
      service.createOrReactivateUserMember('room-1', 'user-1', 'Player'),
    ).rejects.toMatchObject({
      response: {
        code: 'MEMBER_KICKED',
      },
    });
    expect(roomModel.updateOne).not.toHaveBeenCalled();
    expect(roomMemberModel.create).not.toHaveBeenCalled();
  });

  it('enforces room capacity when adding a new member', async () => {
    const roomModel = {
      updateOne: jest.fn(() => ({
        exec: () => Promise.resolve({ modifiedCount: 0 }),
      })),
    };
    const roomMemberModel = {
      findOne: jest.fn(() => leanExec(null)),
      create: jest.fn(),
      updateOne: jest.fn(),
    };
    const matchModel = {
      countDocuments: jest.fn(),
    };

    const service = new RoomsService(
      roomModel as any,
      roomMemberModel as any,
      matchModel as any,
      configService as any,
    );

    await expect(
      service.createOrReactivateUserMember('room-1', 'user-2', 'Player 2'),
    ).rejects.toMatchObject({
      response: {
        code: 'ROOM_FULL',
      },
    });
    expect(roomMemberModel.create).not.toHaveBeenCalled();
  });
});
