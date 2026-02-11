import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const buildService = (frontendUrl?: string) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'FRONTEND_URL') {
          return frontendUrl ?? defaultValue;
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
    };

    const refreshSessionModel = {
      create: jest.fn(),
    };

    const service = new AuthService(
      configService,
      jwtService,
      usersService as any,
      oauthStateModel as any,
      refreshSessionModel as any,
    );

    return { service, oauthStateModel };
  };

  it('rejects callback profile resolution without OAuth code', async () => {
    const { service } = buildService();

    await expect(
      (
        service as unknown as {
          resolveGoogleProfile: (
            dto: Record<string, unknown>,
          ) => Promise<unknown>;
        }
      ).resolveGoogleProfile({
        mockEmail: 'attacker@example.com',
        mockSub: 'fake-sub',
        mockName: 'Attacker',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'AUTH_CODE_REQUIRED',
      },
    });
  });

  it('accepts redirect targets only from configured origins', async () => {
    const { service, oauthStateModel } = buildService(
      'https://app.example.com,http://localhost:1073',
    );

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
});
