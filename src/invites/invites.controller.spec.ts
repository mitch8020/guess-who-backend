import { UnauthorizedException } from '@nestjs/common';
import { InvitesController } from './invites.controller';

describe('InvitesController', () => {
  const principal = { kind: 'user' as const, userId: 'user-1' };

  it('requires principal for invite creation', async () => {
    const invitesService = {
      createInvite: jest.fn(),
      resolveInvite: jest.fn(),
      joinInvite: jest.fn(),
      revokeInvite: jest.fn(),
    };
    const authService = { getOptionalPrincipal: jest.fn() };
    const controller = new InvitesController(
      invitesService as any,
      authService as any,
    );

    expect(() => controller.createInvite('room-1', {}, undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('delegates resolve and join', async () => {
    const invitesService = {
      createInvite: jest.fn(),
      resolveInvite: jest.fn(() =>
        Promise.resolve({ invite: { code: 'ABCD' } }),
      ),
      joinInvite: jest.fn(() =>
        Promise.resolve({ member: { _id: 'member-1' } }),
      ),
      revokeInvite: jest.fn(),
    };
    const authService = {
      getOptionalPrincipal: jest.fn(() => ({
        kind: 'guest',
        roomId: 'room-1',
        memberId: 'm-1',
        displayName: 'G',
      })),
    };
    const controller = new InvitesController(
      invitesService as any,
      authService as any,
    );

    await expect(controller.resolveInvite('ABCD')).resolves.toEqual({
      invite: { code: 'ABCD' },
    });
    await expect(
      controller.joinInvite('ABCD', { displayName: 'Guest' }, 'Bearer token'),
    ).resolves.toEqual({ member: { _id: 'member-1' } });
    expect(authService.getOptionalPrincipal).toHaveBeenCalledWith(
      'Bearer token',
    );
  });

  it('delegates create and revoke for authenticated principal', async () => {
    const invitesService = {
      createInvite: jest.fn(() =>
        Promise.resolve({ invite: { _id: 'invite-1' } }),
      ),
      resolveInvite: jest.fn(),
      joinInvite: jest.fn(),
      revokeInvite: jest.fn(() =>
        Promise.resolve({ invite: { _id: 'invite-1' } }),
      ),
    };
    const authService = { getOptionalPrincipal: jest.fn() };
    const controller = new InvitesController(
      invitesService as any,
      authService as any,
    );

    await expect(
      controller.createInvite('room-1', { allowGuestJoin: true }, principal),
    ).resolves.toEqual({ invite: { _id: 'invite-1' } });
    await expect(
      controller.revokeInvite('room-1', 'invite-1', principal),
    ).resolves.toEqual({ invite: { _id: 'invite-1' } });
  });

  it('requires principal for revoke', async () => {
    const invitesService = {
      createInvite: jest.fn(),
      resolveInvite: jest.fn(),
      joinInvite: jest.fn(),
      revokeInvite: jest.fn(),
    };
    const authService = { getOptionalPrincipal: jest.fn() };
    const controller = new InvitesController(
      invitesService as any,
      authService as any,
    );

    expect(() =>
      controller.revokeInvite('room-1', 'invite-1', undefined),
    ).toThrow(UnauthorizedException);
  });
});
