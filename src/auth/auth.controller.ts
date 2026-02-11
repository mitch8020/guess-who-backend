import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { RequestPrincipal } from '../common/types/domain.types';
import { AuthService } from './auth.service';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google')
  async getGoogleStart(
    @Query('redirectTo') redirectTo: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const oauthStart = await this.authService.createOAuthStart(redirectTo);
    response.redirect(oauthStart.url);
  }

  @Get('google/callback')
  async googleCallback(
    @Query() query: OAuthCallbackDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const session = await this.authService.handleGoogleCallback(query);
    this.attachRefreshCookie(response, session.refreshToken);
    if (session.redirectTo) {
      const redirectUrl = new URL(session.redirectTo);
      redirectUrl.hash = new URLSearchParams({
        accessToken: session.accessToken,
      }).toString();
      response.redirect(redirectUrl.toString());
      return { redirected: true };
    }
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const refreshToken = this.readRefreshCookie(response);
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REQUIRED',
        message: 'A refresh token is required.',
        details: {},
      });
    }
    const session = await this.authService.refreshSession(refreshToken);
    this.attachRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) response: Response): Promise<void> {
    const refreshToken = this.readRefreshCookie(response);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    response.clearCookie('refreshToken', this.refreshCookieOptions);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A valid user session is required.',
        details: {},
      });
    }
    const user = await this.authService.getCurrentUser(principal.userId);
    return { user };
  }

  private attachRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie('refreshToken', refreshToken, this.refreshCookieOptions);
  }

  private readRefreshCookie(response: Response): string | undefined {
    const request = response.req as unknown;
    if (!request || typeof request !== 'object') {
      return undefined;
    }
    const cookies = (request as { cookies?: unknown }).cookies;
    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }
    const cookieValue = (cookies as Record<string, unknown>).refreshToken;
    return typeof cookieValue === 'string' ? cookieValue : undefined;
  }

  private get refreshCookieOptions(): {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge: number;
  } {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    };
  }
}
