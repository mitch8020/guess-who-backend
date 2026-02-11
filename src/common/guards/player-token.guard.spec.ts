import { UnauthorizedException } from '@nestjs/common';
import { PlayerTokenGuard } from './player-token.guard';

describe('PlayerTokenGuard', () => {
  const buildContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  it('sets principal when player token is valid', () => {
    const authService = {
      extractBearerToken: jest.fn(() => 'token'),
      verifyPlayerToken: jest.fn(() => ({
        kind: 'guest',
        roomId: 'room-1',
        memberId: 'member-1',
        displayName: 'Guest',
      })),
    };
    const guard = new PlayerTokenGuard(authService as any);
    const request: any = { headers: { authorization: 'Bearer token' } };

    expect(guard.canActivate(buildContext(request))).toBe(true);
    expect(request.principal).toEqual({
      kind: 'guest',
      roomId: 'room-1',
      memberId: 'member-1',
      displayName: 'Guest',
    });
  });

  it('throws when token is missing', () => {
    const authService = {
      extractBearerToken: jest.fn(() => undefined),
      verifyPlayerToken: jest.fn(),
    };
    const guard = new PlayerTokenGuard(authService as any);
    const request = { headers: {} };

    expect(() => guard.canActivate(buildContext(request))).toThrow(
      UnauthorizedException,
    );
    expect(authService.verifyPlayerToken).not.toHaveBeenCalled();
  });
});
