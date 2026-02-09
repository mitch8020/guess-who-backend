import {
  Body,
  Controller,
  Get,
  Headers,
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
import { LogoutDto } from './dto/logout.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { RefreshDto } from './dto/refresh.dto';

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
    if (session.redirectTo) {
      const redirectUrl = new URL(session.redirectTo);
      redirectUrl.hash = new URLSearchParams({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      }).toString();
      response.redirect(redirectUrl.toString());
      return { redirected: true };
    }
    this.attachRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: RefreshDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    const tokenFromHeader = this.authService.extractBearerToken(authorizationHeader);
    const refreshToken = body.refreshToken ?? tokenFromHeader ?? response.req.cookies?.refreshToken;
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
      refreshToken: session.refreshToken,
      user: session.user,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: LogoutDto,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const tokenFromHeader = this.authService.extractBearerToken(authorizationHeader);
    const refreshToken = body.refreshToken ?? tokenFromHeader ?? response.req.cookies?.refreshToken;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    response.clearCookie('refreshToken');
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
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
