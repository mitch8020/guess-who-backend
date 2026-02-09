import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateRoomDto } from './dto/create-room.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  createRoom(
    @Body() dto: CreateRoomDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Record<string, unknown> {
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
  listRooms(@CurrentPrincipal() principal: RequestPrincipal | undefined): Record<string, unknown> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to list rooms.',
        details: {},
      });
    }
    return { rooms: this.roomsService.listRoomsForUser(principal.userId) };
  }

  @Get(':roomId')
  @UseGuards(PlayerTokenGuard)
  getRoomDetail(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Record<string, unknown> {
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
  updateRoom(
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Record<string, unknown> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to update room settings.',
        details: {},
      });
    }
    return { room: this.roomsService.updateRoom(roomId, principal.userId, dto) };
  }

  @Delete(':roomId')
  @UseGuards(AccessTokenGuard)
  archiveRoom(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): void {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to archive rooms.',
        details: {},
      });
    }
    this.roomsService.archiveRoom(roomId, principal.userId);
  }

  @Post(':roomId/members/remove')
  @UseGuards(AccessTokenGuard)
  removeMember(
    @Param('roomId') roomId: string,
    @Body() dto: RemoveMemberDto,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
  ): Record<string, unknown> {
    if (!principal || principal.kind !== 'user') {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A signed-in user is required to remove room members.',
        details: {},
      });
    }
    return {
      members: this.roomsService.removeMember(roomId, principal.userId, dto),
    };
  }
}
