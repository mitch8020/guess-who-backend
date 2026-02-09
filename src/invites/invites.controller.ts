import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RequestPrincipal } from '../common/types/domain.types';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JoinInviteDto } from './dto/join-invite.dto';
import { InvitesService } from './invites.service';

@Controller()
export class InvitesController {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly authService: AuthService,
  ) {}

  @Post('rooms/:roomId/invites')
  @UseGuards(PlayerTokenGuard)
  createInvite(
    @Param('roomId') roomId: string,
    @Body() dto: CreateInviteDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Only active room members can create invites.',
        details: {},
      });
    }
    return this.invitesService.createInvite(roomId, principal, dto);
  }

  @Get('invites/:code')
  resolveInvite(@Param('code') code: string): Promise<Record<string, unknown>> {
    return this.invitesService.resolveInvite(code);
  }

  @Post('invites/:code/join')
  @Throttle({ default: { ttl: 600_000, limit: 20 } })
  async joinInvite(
    @Param('code') code: string,
    @Body() dto: JoinInviteDto,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<Record<string, unknown>> {
    const headerPrincipal = this.authService.getOptionalPrincipal(authorizationHeader);
    const bodyPrincipal = dto.authToken
      ? this.authService.getOptionalPrincipal(`Bearer ${dto.authToken}`)
      : undefined;
    const principal = headerPrincipal ?? bodyPrincipal;

    return this.invitesService.joinInvite(code, dto, principal);
  }

  @Post('rooms/:roomId/invites/:inviteId/revoke')
  @UseGuards(AccessTokenGuard)
  revokeInvite(
    @Param('roomId') roomId: string,
    @Param('inviteId') inviteId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A valid user session is required.',
        details: {},
      });
    }
    return this.invitesService.revokeInvite(roomId, inviteId, principal);
  }
}
