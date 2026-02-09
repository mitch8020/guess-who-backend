import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RequestPrincipal } from '../common/types/domain.types';
import { MatchesService } from './matches.service';
import { RematchDto, StartMatchDto } from './dto/start-match.dto';
import { SubmitActionDto } from './dto/submit-action.dto';

@Controller('rooms/:roomId/matches')
@UseGuards(PlayerTokenGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  startMatch(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
    @Body() dto: StartMatchDto,
  ): Record<string, unknown> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required to start a match.',
        details: {},
      });
    }
    return this.matchesService.startMatch(roomId, principal, dto);
  }

  @Get(':matchId')
  getMatch(
    @Param('roomId') roomId: string,
    @Param('matchId') matchId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Record<string, unknown> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required to view match details.',
        details: {},
      });
    }
    return this.matchesService.getMatchDetail(roomId, matchId, principal);
  }

  @Post(':matchId/actions')
  submitAction(
    @Param('roomId') roomId: string,
    @Param('matchId') matchId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
    @Body() dto: SubmitActionDto,
  ): Record<string, unknown> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required to submit actions.',
        details: {},
      });
    }
    return this.matchesService.submitAction(roomId, matchId, principal, dto);
  }

  @Post(':matchId/forfeit')
  forfeit(
    @Param('roomId') roomId: string,
    @Param('matchId') matchId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Record<string, unknown> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required to forfeit match.',
        details: {},
      });
    }
    return this.matchesService.forfeitMatch(roomId, matchId, principal);
  }

  @Post(':matchId/rematch')
  rematch(
    @Param('roomId') roomId: string,
    @Param('matchId') matchId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
    @Body() dto: RematchDto,
  ): Record<string, unknown> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required for rematch.',
        details: {},
      });
    }
    return this.matchesService.rematch(roomId, matchId, principal, dto);
  }
}
