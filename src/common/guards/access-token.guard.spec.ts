import { UnauthorizedException } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';

describe('AccessTokenGuard', () => {
  const buildContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as any;

  it('sets principal when bearer token is valid', () => {
    const authService = {
      extractBearerToken: jest.fn(() => 'token'),
      verifyAccessToken: jest.fn(() => ({ kind: 'user', userId: 'user-1' })),
    };
    const guard = new AccessTokenGuard(authService as any);
    const request: any = { headers: { authorization: 'Bearer token' } };

    expect(guard.canActivate(buildContext(request))).toBe(true);
    expect(request.principal).toEqual({ kind: 'user', userId: 'user-1' });
  });

  it('throws when token is missing', () => {
    const authService = {
      extractBearerToken: jest.fn(() => undefined),
      verifyAccessToken: jest.fn(),
    };
    const guard = new AccessTokenGuard(authService as any);
    const request = { headers: {} };

    expect(() => guard.canActivate(buildContext(request))).toThrow(
      UnauthorizedException,
    );
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });
});
