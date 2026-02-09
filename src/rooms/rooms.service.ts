import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ROOM_DEFAULTS } from '../common/constants';
import {
  RequestPrincipal,
  RoomMemberRecord,
  RoomRecord,
  RoomSettings,
} from '../common/types/domain.types';
import { createId } from '../common/utils/crypto.util';
import { InMemoryStore } from '../store/in-memory.store';
import { CreateRoomDto } from './dto/create-room.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  private readonly temporaryRoomTtlHours: number;

  constructor(
    private readonly store: InMemoryStore,
    configService: ConfigService,
  ) {
    this.temporaryRoomTtlHours = Number(
      configService.get<string>('TEMP_ROOM_TTL_HOURS', String(ROOM_DEFAULTS.temporaryTtlHours)),
    );
  }

  createRoom(hostUserId: string, dto: CreateRoomDto): {
    room: RoomRecord;
    hostMember: RoomMemberRecord;
  } {
    const now = new Date();
    const settings = this.normalizeRoomSettings(dto.settings);
    const room: RoomRecord = {
      _id: createId(),
      name: dto.name.trim(),
      type: dto.type,
      hostUserId,
      settings,
      temporaryExpiresAt:
        dto.type === 'temporary'
          ? new Date(now.getTime() + this.temporaryRoomTtlHours * 3_600_000)
          : undefined,
      lastActivityAt: now,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    const hostMember: RoomMemberRecord = {
      _id: createId(),
      roomId: room._id,
      userId: hostUserId,
      displayName: 'Host',
      role: 'host',
      status: 'active',
      joinedAt: now,
      lastSeenAt: now,
    };

    this.store.rooms.set(room._id, room);
    this.store.roomMembers.set(hostMember._id, hostMember);

    return { room, hostMember };
  }

  listRoomsForUser(userId: string): RoomRecord[] {
    const joinedRoomIds = new Set(
      [...this.store.roomMembers.values()]
        .filter((member) => member.userId === userId && member.status === 'active')
        .map((member) => member.roomId),
    );

    return [...this.store.rooms.values()]
      .filter((room) => !room.isArchived && joinedRoomIds.has(room._id))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getRoomById(roomId: string): RoomRecord {
    const room = this.store.rooms.get(roomId);
    if (!room || room.isArchived) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'Room does not exist or is no longer available.',
        details: {},
      });
    }
    return room;
  }

  getRoomDetailForPrincipal(roomId: string, principal: RequestPrincipal): Record<string, unknown> {
    const room = this.getRoomById(roomId);
    const member = this.ensureActiveMember(roomId, principal);
    const members = this.listRoomMembers(roomId);
    return { room, member, members };
  }

  updateRoom(roomId: string, hostUserId: string, dto: UpdateRoomDto): RoomRecord {
    const room = this.getRoomById(roomId);
    this.ensureHostUser(room, hostUserId);

    const updatedRoom: RoomRecord = {
      ...room,
      name: dto.name?.trim() ?? room.name,
      settings: dto.settings
        ? this.normalizeRoomSettings({
            ...room.settings,
            ...dto.settings,
          })
        : room.settings,
      updatedAt: new Date(),
    };

    this.store.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  archiveRoom(roomId: string, hostUserId: string): void {
    const room = this.getRoomById(roomId);
    this.ensureHostUser(room, hostUserId);

    const activeMatch = [...this.store.matches.values()].find(
      (match) =>
        match.roomId === roomId &&
        (match.status === 'in_progress' || match.status === 'waiting'),
    );
    if (activeMatch) {
      throw new BadRequestException({
        code: 'ROOM_HAS_ACTIVE_MATCH',
        message: 'Cannot archive room while an active match is running.',
        details: { matchId: activeMatch._id },
      });
    }

    room.isArchived = true;
    room.updatedAt = new Date();
    this.store.rooms.set(roomId, room);
  }

  removeMember(roomId: string, hostUserId: string, dto: RemoveMemberDto): RoomMemberRecord[] {
    const room = this.getRoomById(roomId);
    this.ensureHostUser(room, hostUserId);
    const member = this.store.roomMembers.get(dto.memberId);
    if (!member || member.roomId !== roomId || member.status !== 'active') {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'Room member was not found.',
        details: {},
      });
    }
    if (member.role === 'host') {
      throw new BadRequestException({
        code: 'HOST_REMOVE_BLOCKED',
        message: 'Host cannot remove themselves.',
        details: {},
      });
    }

    member.status = 'kicked';
    member.lastSeenAt = new Date();
    this.store.roomMembers.set(member._id, member);
    return this.listRoomMembers(roomId);
  }

  listRoomMembers(roomId: string): RoomMemberRecord[] {
    return [...this.store.roomMembers.values()]
      .filter((member) => member.roomId === roomId && member.status === 'active')
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  }

  ensureActiveMember(roomId: string, principal: RequestPrincipal): RoomMemberRecord {
    const member =
      principal.kind === 'user'
        ? [...this.store.roomMembers.values()].find(
            (candidate) =>
              candidate.roomId === roomId &&
              candidate.userId === principal.userId &&
              candidate.status === 'active',
          )
        : this.store.roomMembers.get(principal.memberId);

    if (
      !member ||
      member.roomId !== roomId ||
      member.status !== 'active' ||
      (principal.kind === 'guest' && principal.roomId !== roomId)
    ) {
      throw new ForbiddenException({
        code: 'ROOM_ACCESS_DENIED',
        message: 'You do not have active access to this room.',
        details: {},
      });
    }
    return member;
  }

  ensureHostMember(roomId: string, principal: RequestPrincipal): RoomMemberRecord {
    const member = this.ensureActiveMember(roomId, principal);
    if (member.role !== 'host') {
      throw new ForbiddenException({
        code: 'HOST_ONLY',
        message: 'Only room hosts can perform this action.',
        details: {},
      });
    }
    return member;
  }

  touchRoomActivity(roomId: string): void {
    const room = this.store.rooms.get(roomId);
    if (!room || room.isArchived) {
      return;
    }
    const now = new Date();
    room.lastActivityAt = now;
    if (room.type === 'temporary') {
      room.temporaryExpiresAt = new Date(now.getTime() + this.temporaryRoomTtlHours * 3_600_000);
    }
    room.updatedAt = now;
    this.store.rooms.set(room._id, room);
  }

  createOrReactivateUserMember(
    roomId: string,
    userId: string,
    displayName: string,
  ): RoomMemberRecord {
    const existing = [...this.store.roomMembers.values()].find(
      (member) => member.roomId === roomId && member.userId === userId,
    );
    if (existing) {
      existing.status = 'active';
      existing.lastSeenAt = new Date();
      existing.displayName = displayName;
      this.store.roomMembers.set(existing._id, existing);
      return existing;
    }

    const member: RoomMemberRecord = {
      _id: createId(),
      roomId,
      userId,
      displayName,
      role: 'player',
      status: 'active',
      joinedAt: new Date(),
      lastSeenAt: new Date(),
    };
    this.store.roomMembers.set(member._id, member);
    return member;
  }

  createGuestMember(roomId: string, guestSessionId: string, displayName: string): RoomMemberRecord {
    const member: RoomMemberRecord = {
      _id: createId(),
      roomId,
      guestSessionId,
      displayName,
      role: 'player',
      status: 'active',
      joinedAt: new Date(),
      lastSeenAt: new Date(),
    };
    this.store.roomMembers.set(member._id, member);
    return member;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  cleanupTemporaryRooms(): void {
    const now = Date.now();
    for (const room of this.store.rooms.values()) {
      if (room.isArchived || room.type !== 'temporary') {
        continue;
      }
      const inactivityMs = now - room.lastActivityAt.getTime();
      const ttlMs = this.temporaryRoomTtlHours * 3_600_000;
      if (inactivityMs > ttlMs) {
        room.isArchived = true;
        room.updatedAt = new Date();
        this.store.rooms.set(room._id, room);
      }
    }
  }

  private ensureHostUser(room: RoomRecord, userId: string): void {
    if (room.hostUserId !== userId) {
      throw new ForbiddenException({
        code: 'HOST_ONLY',
        message: 'Only room hosts can perform this action.',
        details: {},
      });
    }
  }

  private normalizeRoomSettings(settings?: Partial<RoomSettings>): RoomSettings {
    const nextSettings: RoomSettings = {
      allowedBoardSizes:
        settings?.allowedBoardSizes && settings.allowedBoardSizes.length > 0
          ? [...new Set(settings.allowedBoardSizes)].sort((a, b) => a - b)
          : [...ROOM_DEFAULTS.allowedBoardSizes],
      minPlayers: 2,
      maxPlayers: settings?.maxPlayers ?? ROOM_DEFAULTS.maxPlayers,
      allowGuestJoin: settings?.allowGuestJoin ?? true,
    };

    if (nextSettings.maxPlayers < ROOM_DEFAULTS.minPlayers) {
      nextSettings.maxPlayers = ROOM_DEFAULTS.minPlayers;
    }
    if (nextSettings.maxPlayers > ROOM_DEFAULTS.hardMaxPlayers) {
      nextSettings.maxPlayers = ROOM_DEFAULTS.hardMaxPlayers;
    }
    return nextSettings;
  }
}
