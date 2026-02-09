import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import {
  MODEL_NAMES,
  OAuthStateDocument,
  RefreshSessionDocument,
} from '../common/schemas/persistence.schemas';
import {
  OAuthStateRecord,
  RefreshSessionRecord,
  RequestPrincipal,
  RequestPrincipalGuest,
  RequestPrincipalUser,
  RoomMemberRecord,
  UserRecord,
} from '../common/types/domain.types';
import {
  createId,
  createRandomHex,
  parseDurationMs,
  sha256,
} from '../common/utils/crypto.util';
import { UsersService } from '../users/users.service';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';

interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  private readonly oauthClient?: OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @InjectModel(MODEL_NAMES.OAuthState)
    private readonly oauthStateModel: Model<OAuthStateDocument>,
    @InjectModel(MODEL_NAMES.RefreshSession)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
  ) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL');
    if (clientId && clientSecret && callbackUrl) {
      this.oauthClient = new OAuth2Client(clientId, clientSecret, callbackUrl);
    }
  }

  async createOAuthStart(redirectTo?: string): Promise<{ url: string; state: string; expiresAt: Date }> {
    const state = createRandomHex(16);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const allowedFrontendOrigin = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const normalizedRedirect =
      redirectTo && redirectTo.startsWith(allowedFrontendOrigin)
        ? redirectTo
        : undefined;
    const stateRecord: OAuthStateRecord = {
      state,
      createdAt: new Date(),
      expiresAt,
      redirectTo: normalizedRedirect,
    };
    await this.oauthStateModel.create(stateRecord);
    return {
      state,
      expiresAt,
      url: this.buildGoogleRedirectUrl(state),
    };
  }

  async handleGoogleCallback(dto: OAuthCallbackDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserRecord;
    redirectTo?: string;
  }> {
    if (!dto.state) {
      throw new BadRequestException({
        code: 'AUTH_STATE_MISSING',
        message: 'OAuth state parameter is required.',
        details: {},
      });
    }

    const stateRecord = await this.oauthStateModel
      .findOne({ state: dto.state })
      .lean<OAuthStateRecord>()
      .exec();
    if (!stateRecord || stateRecord.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'AUTH_STATE_INVALID',
        message: 'OAuth state is invalid or expired.',
        details: {},
      });
    }
    await this.oauthStateModel.deleteOne({ state: dto.state }).exec();

    if (dto.error) {
      throw new BadRequestException({
        code: 'AUTH_DENIED',
        message: 'Google authentication was denied by the user.',
        details: { providerError: dto.error },
      });
    }

    const profile = await this.resolveGoogleProfile(dto);
    const existingByEmail = await this.usersService.findByEmail(profile.email);
    if (existingByEmail && existingByEmail.googleId !== profile.sub) {
      throw new ForbiddenException({
        code: 'AUTH_ACCOUNT_CONFLICT',
        message: 'An existing account is associated with this email.',
        details: {},
      });
    }

    const user = await this.usersService.upsertGoogleUser({
      googleId: profile.sub,
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.picture,
    });

    const { accessToken, refreshToken } = await this.issueSessionTokens(user);
    return {
      accessToken,
      refreshToken,
      user,
      redirectTo: stateRecord.redirectTo,
    };
  }

  async refreshSession(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: UserRecord;
  }> {
    const session = await this.verifyRefreshSession(refreshToken);
    await this.refreshSessionModel
      .updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } })
      .exec();

    const user = await this.requireActiveUser(session.userId);
    const { accessToken, refreshToken: rotatedRefreshToken } =
      await this.issueSessionTokens(user);

    return { accessToken, refreshToken: rotatedRefreshToken, user };
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const session = await this.verifyRefreshSession(refreshToken);
      await this.refreshSessionModel
        .updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } })
        .exec();
    } catch {
      // Logout should be idempotent; invalid tokens do not throw.
    }
  }

  async getCurrentUser(userId: string): Promise<UserRecord> {
    return this.requireActiveUser(userId);
  }

  createGuestToken(member: RoomMemberRecord): string {
    const payload = {
      type: 'guest',
      memberId: member._id,
      roomId: member.roomId,
      displayName: member.displayName,
    };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET', 'dev-secret'),
      expiresIn: this.configService.get<string>('GUEST_TOKEN_EXPIRES_IN', '24h') as any,
    });
  }

  extractBearerToken(authorizationHeader: unknown): string | undefined {
    if (typeof authorizationHeader !== 'string') {
      return undefined;
    }
    const [scheme, token] = authorizationHeader.split(' ');
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      return undefined;
    }
    return token.trim();
  }

  verifyAccessToken(token: string): RequestPrincipalUser {
    try {
      const payload = this.jwtService.verify<{
        type: string;
        sub: string;
      }>(token, {
        secret: this.configService.get<string>('JWT_SECRET', 'dev-secret'),
      });
      if (payload.type !== 'access' || !payload.sub) {
        throw new Error('Invalid token payload');
      }
      return { kind: 'user', userId: payload.sub };
    } catch {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_INVALID',
        message: 'The access token is invalid or expired.',
        details: {},
      });
    }
  }

  verifyPlayerToken(token: string): RequestPrincipal {
    try {
      return this.verifyAccessToken(token);
    } catch {
      return this.verifyGuestToken(token);
    }
  }

  getOptionalPrincipal(authorizationHeader: unknown): RequestPrincipal | undefined {
    const token = this.extractBearerToken(authorizationHeader);
    if (!token) {
      return undefined;
    }
    try {
      return this.verifyPlayerToken(token);
    } catch {
      return undefined;
    }
  }

  verifyGuestToken(token: string): RequestPrincipalGuest {
    try {
      const payload = this.jwtService.verify<{
        type: string;
        roomId: string;
        memberId: string;
        displayName: string;
      }>(token, {
        secret: this.configService.get<string>('JWT_SECRET', 'dev-secret'),
      });
      if (payload.type !== 'guest') {
        throw new Error('Invalid guest token');
      }
      return {
        kind: 'guest',
        roomId: payload.roomId,
        memberId: payload.memberId,
        displayName: payload.displayName,
      };
    } catch {
      throw new UnauthorizedException({
        code: 'GUEST_TOKEN_INVALID',
        message: 'The guest token is invalid or expired.',
        details: {},
      });
    }
  }

  private buildGoogleRedirectUrl(state: string): string {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL');
    if (!clientId || !callbackUrl) {
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`;
    }

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    return url.toString();
  }

  private async resolveGoogleProfile(dto: OAuthCallbackDto): Promise<GoogleProfile> {
    if (dto.code && this.oauthClient) {
      const tokenResponse = await this.oauthClient.getToken(dto.code);
      const idToken = tokenResponse.tokens.id_token;
      if (!idToken) {
        throw new BadRequestException({
          code: 'AUTH_ID_TOKEN_MISSING',
          message: 'Google callback did not include an ID token.',
          details: {},
        });
      }

      const verified = await this.oauthClient.verifyIdToken({
        idToken,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });
      const payload = verified.getPayload();
      if (!payload?.sub || !payload.email || !payload.name) {
        throw new BadRequestException({
          code: 'AUTH_PROFILE_INVALID',
          message: 'Google profile payload is incomplete.',
          details: {},
        });
      }
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };
    }

    if (dto.mockEmail && dto.mockSub && dto.mockName) {
      return {
        sub: dto.mockSub,
        email: dto.mockEmail,
        name: dto.mockName,
        picture: dto.mockAvatarUrl,
      };
    }

    throw new BadRequestException({
      code: 'AUTH_CODE_REQUIRED',
      message: 'OAuth callback code is required.',
      details: {},
    });
  }

  private async issueSessionTokens(user: UserRecord): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const jwtSecret = this.configService.get<string>('JWT_SECRET', 'dev-secret');
    const accessExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.configService.get<string>(
      'REFRESH_EXPIRES_IN',
      '30d',
    );
    const sessionId = createId();

    const accessToken = this.jwtService.sign(
      { type: 'access', sub: user._id },
      { secret: jwtSecret, expiresIn: accessExpiresIn as any },
    );

    const refreshToken = this.jwtService.sign(
      { type: 'refresh', sub: user._id, sid: sessionId },
      { secret: jwtSecret, expiresIn: refreshExpiresIn as any },
    );

    const refreshSession: RefreshSessionRecord = {
      _id: sessionId,
      userId: user._id,
      tokenHash: sha256(refreshToken),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + parseDurationMs(refreshExpiresIn)),
    };
    await this.refreshSessionModel.create(refreshSession);

    return { accessToken, refreshToken };
  }

  private async verifyRefreshSession(refreshToken: string): Promise<RefreshSessionRecord> {
    try {
      const payload = this.jwtService.verify<{
        type: string;
        sub: string;
        sid: string;
      }>(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET', 'dev-secret'),
      });

      if (payload.type !== 'refresh' || !payload.sid || !payload.sub) {
        throw new Error('Invalid refresh payload');
      }

      const session = await this.refreshSessionModel
        .findById(payload.sid)
        .lean<RefreshSessionRecord>()
        .exec();
      if (!session) {
        throw new Error('Session missing');
      }
      if (session.revokedAt) {
        throw new Error('Session revoked');
      }
      if (session.expiresAt.getTime() < Date.now()) {
        throw new Error('Session expired');
      }
      if (session.tokenHash !== sha256(refreshToken)) {
        throw new Error('Token mismatch');
      }
      return session;
    } catch {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'The refresh token is invalid or expired.',
        details: {},
      });
    }
  }

  private async requireActiveUser(userId: string): Promise<UserRecord> {
    const user = await this.usersService.findById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'USER_NOT_ACTIVE',
        message: 'User session is not active.',
        details: {},
      });
    }
    return user;
  }
}
