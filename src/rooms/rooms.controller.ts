import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RequestPrincipal } from '../common/types/domain.types';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { MuteMemberDto } from './dto/mute-member.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  createRoom(
    @Body() dto: CreateRoomDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to create a room.',
        details: {},
      });
    }
    return this.roomsService.createRoom(principal.userId, dto);
  }

  @Get()
  @UseGuards(AccessTokenGuard)
  async listRooms(
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to list rooms.',
        details: {},
      });
    }
    return { rooms: await this.roomsService.listRoomsForUser(principal.userId) };
  }

  @Get(':roomId')
  @UseGuards(PlayerTokenGuard)
  async getRoomDetail(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required.',
        details: {},
      });
    }
    return this.roomsService.getRoomDetailForPrincipal(roomId, principal);
  }

  @Patch(':roomId')
  @UseGuards(AccessTokenGuard)
  async updateRoom(
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to update room settings.',
        details: {},
      });
    }
    return { room: await this.roomsService.updateRoom(roomId, principal.userId, dto) };
  }

  @Delete(':roomId')
  @UseGuards(AccessTokenGuard)
  async archiveRoom(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<void> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to archive rooms.',
        details: {},
      });
    }
    await this.roomsService.archiveRoom(roomId, principal.userId);
  }

  @Post(':roomId/members/remove')
  @UseGuards(AccessTokenGuard)
  async removeMember(
    @Param('roomId') roomId: string,
    @Body() dto: RemoveMemberDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to remove room members.',
        details: {},
      });
    }
    return {
      members: await this.roomsService.removeMember(roomId, principal.userId, dto),
    };
  }

  @Post(':roomId/members/:memberId/mute')
  @UseGuards(AccessTokenGuard)
  @HttpCode(200)
  async muteMember(
    @Param('roomId') roomId: string,
    @Param('memberId') memberId: string,
    @Body() dto: MuteMemberDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to mute room members.',
        details: {},
      });
    }

    const mutedUntil = new Date(Date.now() + dto.durationMinutes * 60_000);
    const member = await this.roomsService.muteMember(roomId, principal.userId, memberId, mutedUntil);
    this.realtimeService.publishRoomUpdate(roomId, 'member.muted', {
      roomId,
      memberId,
      mutedUntil,
    });
    return { member };
  }

  @Post(':roomId/members/:memberId/unmute')
  @UseGuards(AccessTokenGuard)
  @HttpCode(200)
  async unmuteMember(
    @Param('roomId') roomId: string,
    @Param('memberId') memberId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Promise<Record<string, unknown>> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to unmute room members.',
        details: {},
      });
    }

    const member = await this.roomsService.unmuteMember(roomId, principal.userId, memberId);
    this.realtimeService.publishRoomUpdate(roomId, 'member.unmuted', {
      roomId,
      memberId,
    });
    return { member };
  }
}
