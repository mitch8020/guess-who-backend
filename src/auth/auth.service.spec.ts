import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

const leanExec = <T>(value: T) => ({
  lean: () => ({
    exec: () => Promise.resolve(value),
  }),
});

describe('AuthService', () => {
  const buildService = (overrides?: {
    frontendUrl?: string;
    jwtSecret?: string;
    googleClientId?: string;
    googleClientSecret?: string;
    googleCallbackUrl?: string;
  }) => {
    const jwtSecret =
      overrides?.jwtSecret ?? 'test-secret-with-at-least-32-characters';
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'JWT_SECRET') {
          return jwtSecret;
        }
        if (key === 'FRONTEND_URL') {
          return overrides?.frontendUrl ?? defaultValue;
        }
        if (key === 'GOOGLE_CLIENT_ID') {
          return overrides?.googleClientId ?? defaultValue;
        }
        if (key === 'GOOGLE_CLIENT_SECRET') {
          return overrides?.googleClientSecret ?? defaultValue;
        }
        if (key === 'GOOGLE_CALLBACK_URL') {
          return overrides?.googleCallbackUrl ?? defaultValue;
        }
        return defaultValue;
      }),
    } as unknown as ConfigService;

    const jwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    } as unknown as JwtService;

    const usersService = {
      findByEmail: jest.fn(),
      upsertGoogleUser: jest.fn(),
      findById: jest.fn(),
    };

    const oauthStateModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      deleteOne: jest.fn(() => ({
        exec: () => Promise.resolve(undefined),
      })),
    };

    const refreshSessionModel = {
      create: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn(() => ({
        exec: () => Promise.resolve(undefined),
      })),
    };

    const service = new AuthService(
      configService,
      jwtService,
      usersService as any,
      oauthStateModel as any,
      refreshSessionModel as any,
    );

    return {
      service,
      configService,
      jwtService,
      usersService,
      oauthStateModel,
      refreshSessionModel,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires a sufficiently long jwt secret', () => {
    expect(() => buildService({ jwtSecret: 'short-secret' }).service).toThrow(
      'JWT_SECRET must be configured',
    );
  });

  it('rejects callback profile resolution without OAuth code', async () => {
    const { service } = buildService();
    await expect(
      (service as any).resolveGoogleProfile({
        mockEmail: 'attacker@example.com',
      }),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_CODE_REQUIRED' },
    });
  });

  it('accepts redirect targets only from configured origins', async () => {
    const { service, oauthStateModel } = buildService({
      frontendUrl: 'https://app.example.com,http://localhost:1073',
    });

    await service.createOAuthStart('https://app.example.com/auth/callback');
    expect(oauthStateModel.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        redirectTo: 'https://app.example.com/auth/callback',
      }),
    );

    await service.createOAuthStart('https://evil.example.com/auth/callback');
    expect(oauthStateModel.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        redirectTo: undefined,
      }),
    );
  });

  it('extracts and validates bearer headers', () => {
    const { service } = buildService();

    expect(service.extractBearerToken('Bearer abc')).toBe('abc');
    expect(service.extractBearerToken('bearer xyz')).toBe('xyz');
    expect(service.extractBearerToken('Basic abc')).toBeUndefined();
    expect(service.extractBearerToken(undefined)).toBeUndefined();
  });

  it('verifies and rejects access tokens correctly', () => {
    const { service, jwtService } = buildService();
    (jwtService.verify as jest.Mock).mockReturnValueOnce({
      type: 'access',
      sub: 'user-1',
    });

    expect(service.verifyAccessToken('token')).toEqual({
      kind: 'user',
      userId: 'user-1',
    });

    (jwtService.verify as jest.Mock).mockReturnValueOnce({ type: 'guest' });
    expect(() => service.verifyAccessToken('bad-token')).toThrow(
      'The access token is invalid or expired.',
    );
  });

  it('falls back to guest verification for player tokens', () => {
    const { service, jwtService } = buildService();
    (jwtService.verify as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('invalid access');
      })
      .mockReturnValueOnce({
        type: 'guest',
        roomId: 'room-1',
        memberId: 'member-1',
        displayName: 'Guest',
      });

    expect(service.verifyPlayerToken('guest-token')).toEqual({
      kind: 'guest',
      roomId: 'room-1',
      memberId: 'member-1',
      displayName: 'Guest',
    });
  });

  it('returns optional principal from auth header', () => {
    const { service } = buildService();
    jest.spyOn(service, 'verifyPlayerToken').mockReturnValue({
      kind: 'user',
      userId: 'user-1',
    });

    expect(service.getOptionalPrincipal('Bearer token')).toEqual({
      kind: 'user',
      userId: 'user-1',
    });

    (service.verifyPlayerToken as jest.Mock).mockImplementationOnce(() => {
      throw new Error('invalid token');
    });
    expect(service.getOptionalPrincipal('Bearer token')).toBeUndefined();
    expect(service.getOptionalPrincipal(undefined)).toBeUndefined();
  });

  it('creates guest tokens with configured expiration', () => {
    const { service, jwtService, configService } = buildService();
    (configService.get as jest.Mock).mockImplementation(
      (key: string, defaultValue?: string) => {
        if (key === 'JWT_SECRET') {
          return 'test-secret-with-at-least-32-characters';
        }
        if (key === 'GUEST_TOKEN_EXPIRES_IN') {
          return '12h';
        }
        return defaultValue;
      },
    );
    (jwtService.sign as jest.Mock).mockReturnValue('guest-jwt');

    const token = service.createGuestToken({
      _id: 'member-1',
      roomId: 'room-1',
      displayName: 'Guest',
      role: 'player',
      status: 'active',
      joinedAt: new Date(),
      lastSeenAt: new Date(),
    } as any);

    expect(token).toBe('guest-jwt');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'guest',
        memberId: 'member-1',
      }),
      expect.objectContaining({ expiresIn: '12h' }),
    );
  });

  it('refreshes session by revoking prior session and issuing new tokens', async () => {
    const { service, refreshSessionModel } = buildService();
    const verifyRefreshSessionSpy = jest
      .spyOn(service as any, 'verifyRefreshSession')
      .mockResolvedValue({
        _id: 'session-1',
        userId: 'user-1',
      });
    const requireActiveUserSpy = jest
      .spyOn(service as any, 'requireActiveUser')
      .mockResolvedValue({
        _id: 'user-1',
        status: 'active',
      });
    const issueSessionTokensSpy = jest
      .spyOn(service as any, 'issueSessionTokens')
      .mockResolvedValue({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
      });

    await expect(service.refreshSession('refresh-1')).resolves.toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      user: { _id: 'user-1', status: 'active' },
    });
    expect(verifyRefreshSessionSpy).toHaveBeenCalledWith('refresh-1');
    expect(refreshSessionModel.updateOne).toHaveBeenCalledWith(
      { _id: 'session-1' },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(requireActiveUserSpy).toHaveBeenCalledWith('user-1');
    expect(issueSessionTokensSpy).toHaveBeenCalledWith({
      _id: 'user-1',
      status: 'active',
    });
  });

  it('logout is idempotent when refresh token verification fails', async () => {
    const { service, refreshSessionModel } = buildService();
    jest
      .spyOn(service as any, 'verifyRefreshSession')
      .mockRejectedValue(new Error('invalid'));

    await expect(service.logout('bad-token')).resolves.toBeUndefined();
    expect(refreshSessionModel.updateOne).not.toHaveBeenCalled();
  });

  it('handles callback state validation and account conflicts', async () => {
    const { service, oauthStateModel, usersService } = buildService();
    oauthStateModel.findOne.mockReturnValueOnce(
      leanExec({
        state: 'valid-state',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    usersService.findByEmail.mockResolvedValue({
      _id: 'user-1',
      googleId: 'another-google-id',
    });
    jest.spyOn(service as any, 'resolveGoogleProfile').mockResolvedValue({
      sub: 'google-123',
      email: 'user@example.com',
      name: 'User',
      picture: undefined,
    });

    await expect(
      service.handleGoogleCallback({
        state: 'valid-state',
        code: 'auth-code',
      } as any),
    ).rejects.toThrow('An existing account is associated with this email.');
    expect(oauthStateModel.deleteOne).toHaveBeenCalledWith({
      state: 'valid-state',
    });
  });

  it('returns full callback session payload on success', async () => {
    const { service, oauthStateModel, usersService } = buildService();
    oauthStateModel.findOne.mockReturnValueOnce(
      leanExec({
        state: 'valid-state',
        expiresAt: new Date(Date.now() + 60_000),
        redirectTo: 'http://localhost:1073/auth/callback',
      }),
    );
    usersService.findByEmail.mockResolvedValue(undefined);
    usersService.upsertGoogleUser.mockResolvedValue({
      _id: 'user-1',
      status: 'active',
    });
    jest.spyOn(service as any, 'resolveGoogleProfile').mockResolvedValue({
      sub: 'google-123',
      email: 'user@example.com',
      name: 'User',
      picture: undefined,
    });
    jest.spyOn(service as any, 'issueSessionTokens').mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    await expect(
      service.handleGoogleCallback({
        state: 'valid-state',
        code: 'auth-code',
      } as any),
    ).resolves.toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { _id: 'user-1', status: 'active' },
      redirectTo: 'http://localhost:1073/auth/callback',
    });
  });
});
