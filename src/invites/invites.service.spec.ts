import { InvitesService } from './invites.service';

describe('InvitesService', () => {
  const leanExec = <T>(value: T) => ({
    lean: () => ({
      exec: () => Promise.resolve(value),
    }),
  });

  it('atomically rejects join when max uses is exhausted', async () => {
    const inviteModel = {
      findOne: jest.fn(() =>
        leanExec({
          _id: 'invite-1',
          roomId: 'room-1',
          code: 'ABCD1234',
          createdByMemberId: 'member-host',
          allowGuestJoin: true,
          maxUses: 1,
          usesCount: 1,
          createdAt: new Date(),
        }),
      ),
      updateOne: jest.fn(() => ({
        exec: () => Promise.resolve({ modifiedCount: 0 }),
      })),
    };

    const roomsService = {
      getRoomById: jest.fn(() =>
        Promise.resolve({
          _id: 'room-1',
          name: 'Room',
          type: 'temporary',
          hostUserId: 'host-user',
          settings: {
            allowedBoardSizes: [4, 5, 6],
            minPlayers: 2,
            maxPlayers: 8,
            allowGuestJoin: true,
          },
          activeMemberCount: 2,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActivityAt: new Date(),
        }),
      ),
      listRoomMembers: jest.fn(() => Promise.resolve([])),
      createGuestMember: jest.fn(),
      createOrReactivateUserMember: jest.fn(),
      touchRoomActivity: jest.fn(),
    };

    const authService = {
      createGuestToken: jest.fn(),
    };

    const realtimeService = {
      publishRoomUpdate: jest.fn(),
    };

    const service = new InvitesService(
      inviteModel as any,
      roomsService as any,
      authService as any,
      realtimeService as any,
    );

    await expect(
      service.joinInvite('abcd1234', { displayName: 'Guest' }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVITE_MAX_USES_REACHED',
      },
    });

    expect(roomsService.createGuestMember).not.toHaveBeenCalled();
    expect(roomsService.createOrReactivateUserMember).not.toHaveBeenCalled();
  });
});
