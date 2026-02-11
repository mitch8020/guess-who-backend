import { MongoServerError } from 'mongodb';
import { MatchesService } from './matches.service';

describe('MatchesService', () => {
  const leanExec = <T>(value: T) => ({
    lean: () => ({
      exec: () => Promise.resolve(value),
    }),
  });

  it('maps duplicate-key match creation to MATCH_ALREADY_ACTIVE', async () => {
    const duplicateError = new MongoServerError({
      code: 11000,
      errmsg: 'duplicate key',
    } as any);

    const matchModel = {
      create: jest.fn(() => {
        throw duplicateError;
      }),
    };

    const matchParticipantModel = {
      insertMany: jest.fn(),
    };

    const matchActionModel = {
      create: jest.fn(),
    };

    const roomMemberModel = {
      findById: jest.fn(() =>
        leanExec({
          _id: 'member-2',
          roomId: 'room-1',
          status: 'active',
          role: 'player',
          displayName: 'Opponent',
          joinedAt: new Date(),
          lastSeenAt: new Date(),
        }),
      ),
    };

    const roomsService = {
      getRoomById: jest.fn(() =>
        Promise.resolve({
          _id: 'room-1',
          settings: {
            allowedBoardSizes: [4, 5, 6],
            maxPlayers: 8,
            minPlayers: 2,
            allowGuestJoin: true,
          },
        }),
      ),
      ensureHostMember: jest.fn(() =>
        Promise.resolve({
          _id: 'member-1',
          roomId: 'room-1',
          role: 'host',
        }),
      ),
      ensureMatchCapacity: jest.fn(() => Promise.resolve(undefined)),
      touchRoomActivity: jest.fn(() => Promise.resolve(undefined)),
    };

    const imagesService = {
      listImages: jest.fn(() =>
        Promise.resolve({
          activeCount: 20,
          minRequiredToStart: 16,
          images: Array.from({ length: 20 }, (_, index) => ({
            _id: `img-${index}`,
          })),
        }),
      ),
    };

    const realtimeService = {
      publishMatchState: jest.fn(),
      publishRoomUpdate: jest.fn(),
    };

    const service = new MatchesService(
      matchModel as any,
      matchParticipantModel as any,
      matchActionModel as any,
      roomMemberModel as any,
      roomsService as any,
      imagesService as any,
      realtimeService as any,
    );

    await expect(
      service.startMatch(
        'room-1',
        { kind: 'user', userId: 'host-user' },
        {
          boardSize: 4,
          opponentMemberId: 'member-2',
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'MATCH_ALREADY_ACTIVE',
      },
    });
  });
});
