import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const makeResponse = (overrides?: Record<string, unknown>) =>
    ({
      redirect: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      req: {
        headers: {},
        cookies: {},
      },
      ...overrides,
    }) as any;

  const originalEnv = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:1073';
  });

  afterEach(() => {
    process.env.FRONTEND_URL = originalEnv;
    jest.clearAllMocks();
  });

  it('redirects to oauth provider start url', async () => {
    const authService = {
      createOAuthStart: jest.fn(() =>
        Promise.resolve({
          state: 'state-1',
          expiresAt: new Date(),
          url: 'https://accounts.google.com/start',
        }),
      ),
    };
    const controller = new AuthController(authService as any);
    const response = makeResponse();

    await controller.getGoogleStart(
      'http://localhost:1073/auth/callback',
      response,
    );
    expect(authService.createOAuthStart).toHaveBeenCalledWith(
      'http://localhost:1073/auth/callback',
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'https://accounts.google.com/start',
    );
  });

  it('returns redirected callback payload when redirect target exists', async () => {
    const authService = {
      handleGoogleCallback: jest.fn(() =>
        Promise.resolve({
          accessToken: 'access',
          refreshToken: 'refresh',
          user: { _id: 'user-1' },
          redirectTo: 'http://localhost:1073/auth/callback',
        }),
      ),
    };
    const controller = new AuthController(authService as any);
    const response = makeResponse();

    const result = await controller.googleCallback(
      { code: 'code', state: 'state' } as any,
      response,
    );

    expect(result).toEqual({ redirected: true });
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
    );
    expect(response.redirect).toHaveBeenCalledWith(
      'http://localhost:1073/auth/callback',
    );
  });

  it('returns tokens for non-redirect callback', async () => {
    const authService = {
      handleGoogleCallback: jest.fn(() =>
        Promise.resolve({
          accessToken: 'access',
          refreshToken: 'refresh',
          user: { _id: 'user-1' },
        }),
      ),
    };
    const controller = new AuthController(authService as any);
    const response = makeResponse();

    await expect(
      controller.googleCallback(
        { code: 'code', state: 'state' } as any,
        response,
      ),
    ).resolves.toEqual({
      accessToken: 'access',
      user: { _id: 'user-1' },
    });
  });

  it('refresh rejects untrusted origins and missing refresh cookies', async () => {
    const authService = { refreshSession: jest.fn() };
    const controller = new AuthController(authService as any);

    await expect(
      controller.refresh(
        makeResponse({
          req: { headers: { origin: 'https://evil.example.com' }, cookies: {} },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      controller.refresh(
        makeResponse({
          req: { headers: { origin: 'http://localhost:1073' }, cookies: {} },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates session and resets cookie', async () => {
    const authService = {
      refreshSession: jest.fn(() =>
        Promise.resolve({
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
          user: { _id: 'user-2' },
        }),
      ),
    };
    const controller = new AuthController(authService as any);
    const response = makeResponse({
      req: {
        headers: { origin: 'http://localhost:1073' },
        cookies: { refreshToken: 'refresh-1' },
      },
    });

    await expect(controller.refresh(response)).resolves.toEqual({
      accessToken: 'access-2',
      user: { _id: 'user-2' },
    });
    expect(authService.refreshSession).toHaveBeenCalledWith('refresh-1');
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-2',
      expect.any(Object),
    );
  });

  it('logout clears refresh cookie and is idempotent', async () => {
    const authService = {
      logout: jest.fn(() => Promise.resolve(undefined)),
    };
    const controller = new AuthController(authService as any);

    const withToken = makeResponse({
      req: {
        headers: { referer: 'http://localhost:1073/path' },
        cookies: { refreshToken: 'refresh-1' },
      },
    });
    const withoutToken = makeResponse({
      req: {
        headers: { origin: 'http://localhost:1073' },
        cookies: {},
      },
    });

    await expect(controller.logout(withToken)).resolves.toBeUndefined();
    await expect(controller.logout(withoutToken)).resolves.toBeUndefined();
    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(withToken.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.any(Object),
    );
    expect(withoutToken.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.any(Object),
    );
  });

  it('returns current user when principal is a signed-in user', async () => {
    const authService = {
      getCurrentUser: jest.fn(() => Promise.resolve({ _id: 'user-1' })),
    };
    const controller = new AuthController(authService as any);

    await expect(
      controller.me({
        kind: 'guest',
        roomId: 'room-1',
        memberId: 'member-1',
        displayName: 'Guest',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      controller.me({ kind: 'user', userId: 'user-1' }),
    ).resolves.toEqual({
      user: { _id: 'user-1' },
    });
  });
});
