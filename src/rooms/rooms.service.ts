import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MAX_ACTIVE_MATCHES_PER_ROOM,
  ROOM_DEFAULTS,
} from '../common/constants';
import {
  MatchDocument,
  MODEL_NAMES,
  RoomDocument,
  RoomMemberDocument,
} from '../common/schemas/persistence.schemas';
import {
  RequestPrincipal,
  RoomMemberRecord,
  RoomRecord,
  RoomSettings,
} from '../common/types/domain.types';
import { createId } from '../common/utils/crypto.util';
import { CreateRoomDto } from './dto/create-room.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

@Injectable()
export class RoomsService {
  private readonly temporaryRoomTtlHours: number;

  constructor(
    @InjectModel(MODEL_NAMES.Room)
    private readonly roomModel: Model<RoomDocument>,
    @InjectModel(MODEL_NAMES.RoomMember)
    private readonly roomMemberModel: Model<RoomMemberDocument>,
    @InjectModel(MODEL_NAMES.Match)
    private readonly matchModel: Model<MatchDocument>,
    configService: ConfigService,
  ) {
    this.temporaryRoomTtlHours = Number(
      configService.get<string>(
        'TEMP_ROOM_TTL_HOURS',
        String(ROOM_DEFAULTS.temporaryTtlHours),
      ),
    );
  }

  async createRoom(
    hostUserId: string,
    dto: CreateRoomDto,
  ): Promise<{
    room: RoomRecord;
    hostMember: RoomMemberRecord;
  }> {
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

    await this.roomModel.create(room);
    await this.roomMemberModel.create(hostMember);

    return { room, hostMember };
  }

  async listRoomsForUser(userId: string): Promise<RoomRecord[]> {
    const memberships = await this.roomMemberModel
      .find({ userId, status: 'active' })
      .lean<RoomMemberRecord[]>()
      .exec();
    const joinedRoomIds = memberships.map((member) => member.roomId);

    if (joinedRoomIds.length === 0) {
      return [];
    }

    return this.roomModel
      .find({ _id: { $in: joinedRoomIds }, isArchived: false })
      .sort({ updatedAt: -1 })
      .lean<RoomRecord[]>()
      .exec();
  }

  async getRoomById(roomId: string): Promise<RoomRecord> {
    const room = await this.roomModel
      .findById(roomId)
      .lean<RoomRecord>()
      .exec();
    if (!room || room.isArchived) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'Room does not exist or is no longer available.',
        details: {},
      });
    }
    return room;
  }

  async getRoomDetailForPrincipal(
    roomId: string,
    principal: RequestPrincipal,
  ): Promise<Record<string, unknown>> {
    const room = await this.getRoomById(roomId);
    const member = await this.ensureActiveMember(roomId, principal);
    const members = await this.listRoomMembers(roomId);
    return { room, member, members };
  }

  async updateRoom(
    roomId: string,
    hostUserId: string,
    dto: UpdateRoomDto,
  ): Promise<RoomRecord> {
    const room = await this.getRoomById(roomId);
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

    await this.roomModel.updateOne({ _id: roomId }, updatedRoom).exec();
    return updatedRoom;
  }

  async archiveRoom(roomId: string, hostUserId: string): Promise<void> {
    const room = await this.getRoomById(roomId);
    this.ensureHostUser(room, hostUserId);

    const activeMatchCount = await this.matchModel
      .countDocuments({ roomId, status: { $in: ['in_progress', 'waiting'] } })
      .exec();
    if (activeMatchCount > 0) {
      throw new BadRequestException({
        code: 'ROOM_HAS_ACTIVE_MATCH',
        message: 'Cannot archive room while an active match is running.',
        details: {},
      });
    }

    await this.roomModel
      .updateOne(
        { _id: roomId },
        { $set: { isArchived: true, updatedAt: new Date() } },
      )
      .exec();
  }

  async removeMember(
    roomId: string,
    hostUserId: string,
    dto: RemoveMemberDto,
  ): Promise<RoomMemberRecord[]> {
    const room = await this.getRoomById(roomId);
    this.ensureHostUser(room, hostUserId);
    const member = await this.roomMemberModel
      .findById(dto.memberId)
      .lean<RoomMemberRecord>()
      .exec();
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

    await this.roomMemberModel
      .updateOne(
        { _id: dto.memberId },
        {
          $set: {
            status: 'kicked',
            lastSeenAt: new Date(),
          },
        },
      )
      .exec();
    return this.listRoomMembers(roomId);
  }

  async muteMember(
    roomId: string,
    hostUserId: string,
    memberId: string,
    mutedUntil: Date,
  ): Promise<RoomMemberRecord> {
    const room = await this.getRoomById(roomId);
    this.ensureHostUser(room, hostUserId);
    const member = await this.roomMemberModel
      .findOneAndUpdate(
        { _id: memberId, roomId, status: 'active' },
        { $set: { mutedUntil } },
        { new: true },
      )
      .lean<RoomMemberRecord>()
      .exec();

    if (!member) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'Room member was not found.',
        details: {},
      });
    }

    return member;
  }

  async unmuteMember(
    roomId: string,
    hostUserId: string,
    memberId: string,
  ): Promise<RoomMemberRecord> {
    const room = await this.getRoomById(roomId);
    this.ensureHostUser(room, hostUserId);
    const member = await this.roomMemberModel
      .findOneAndUpdate(
        { _id: memberId, roomId, status: 'active' },
        { $unset: { mutedUntil: 1 } },
        { new: true },
      )
      .lean<RoomMemberRecord>()
      .exec();

    if (!member) {
      throw new NotFoundException({
        code: 'MEMBER_NOT_FOUND',
        message: 'Room member was not found.',
        details: {},
      });
    }

    return member;
  }

  async listRoomMembers(roomId: string): Promise<RoomMemberRecord[]> {
    return this.roomMemberModel
      .find({ roomId, status: 'active' })
      .sort({ joinedAt: 1 })
      .lean<RoomMemberRecord[]>()
      .exec();
  }

  async ensureActiveMember(
    roomId: string,
    principal: RequestPrincipal,
  ): Promise<RoomMemberRecord> {
    const member =
      principal.kind === 'user'
        ? await this.roomMemberModel
            .findOne({ roomId, userId: principal.userId, status: 'active' })
            .lean<RoomMemberRecord>()
            .exec()
        : await this.roomMemberModel
            .findById(principal.memberId)
            .lean<RoomMemberRecord>()
            .exec();

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

  async ensureHostMember(
    roomId: string,
    principal: RequestPrincipal,
  ): Promise<RoomMemberRecord> {
    const member = await this.ensureActiveMember(roomId, principal);
    if (member.role !== 'host') {
      throw new ForbiddenException({
        code: 'HOST_ONLY',
        message: 'Only room hosts can perform this action.',
        details: {},
      });
    }
    return member;
  }

  async ensureMatchCapacity(roomId: string): Promise<void> {
    const activeMatchCount = await this.matchModel
      .countDocuments({ roomId, status: { $in: ['in_progress', 'waiting'] } })
      .exec();

    if (activeMatchCount >= MAX_ACTIVE_MATCHES_PER_ROOM) {
      throw new BadRequestException({
        code: 'MATCH_ALREADY_ACTIVE',
        message: 'Only one active match is allowed per room.',
        details: {},
      });
    }
  }

  async touchRoomActivity(roomId: string): Promise<void> {
    const room = await this.roomModel
      .findById(roomId)
      .lean<RoomRecord>()
      .exec();
    if (!room || room.isArchived) {
      return;
    }
    const now = new Date();
    const updates: Record<string, unknown> = {
      lastActivityAt: now,
      updatedAt: now,
    };
    if (room.type === 'temporary') {
      updates.temporaryExpiresAt = new Date(
        now.getTime() + this.temporaryRoomTtlHours * 3_600_000,
      );
    }

    await this.roomModel.updateOne({ _id: roomId }, { $set: updates }).exec();
  }

  async createOrReactivateUserMember(
    roomId: string,
    userId: string,
    displayName: string,
  ): Promise<RoomMemberRecord> {
    const existing = await this.roomMemberModel
      .findOne({ roomId, userId })
      .lean<RoomMemberRecord>()
      .exec();
    if (existing) {
      await this.roomMemberModel
        .updateOne(
          { _id: existing._id },
          {
            $set: {
              status: 'active',
              lastSeenAt: new Date(),
              displayName,
            },
          },
        )
        .exec();
      return {
        ...existing,
        status: 'active',
        lastSeenAt: new Date(),
        displayName,
      };
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
    await this.roomMemberModel.create(member);
    return member;
  }

  async createGuestMember(
    roomId: string,
    guestSessionId: string,
    displayName: string,
  ): Promise<RoomMemberRecord> {
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
    await this.roomMemberModel.create(member);
    return member;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async cleanupTemporaryRooms(): Promise<void> {
    const now = Date.now();
    const ttlMs = this.temporaryRoomTtlHours * 3_600_000;
    await this.roomModel
      .updateMany(
        {
          isArchived: false,
          type: 'temporary',
          lastActivityAt: { $lt: new Date(now - ttlMs) },
        },
        {
          $set: {
            isArchived: true,
            updatedAt: new Date(),
          },
        },
      )
      .exec();
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

  private normalizeRoomSettings(
    settings?: Partial<RoomSettings>,
  ): RoomSettings {
    const allowedBoardSizes =
      settings?.allowedBoardSizes && settings.allowedBoardSizes.length > 0
        ? [...new Set(settings.allowedBoardSizes)].sort((a, b) => a - b)
        : [...ROOM_DEFAULTS.allowedBoardSizes];

    let maxPlayers = settings?.maxPlayers ?? ROOM_DEFAULTS.maxPlayers;
    if (maxPlayers < ROOM_DEFAULTS.minPlayers) {
      maxPlayers = ROOM_DEFAULTS.minPlayers;
    }
    if (maxPlayers > ROOM_DEFAULTS.hardMaxPlayers) {
      maxPlayers = ROOM_DEFAULTS.hardMaxPlayers;
    }

    const defaultBoardSize = settings?.defaultBoardSize;
    const rematchBoardSizes =
      settings?.rematchBoardSizes && settings.rematchBoardSizes.length > 0
        ? [...new Set(settings.rematchBoardSizes)].sort((a, b) => a - b)
        : [];

    return {
      allowedBoardSizes,
      minPlayers: ROOM_DEFAULTS.minPlayers,
      maxPlayers,
      allowGuestJoin: settings?.allowGuestJoin ?? true,
      defaultBoardSize:
        defaultBoardSize && allowedBoardSizes.includes(defaultBoardSize)
          ? defaultBoardSize
          : undefined,
      rematchBoardSizes: rematchBoardSizes.filter((size) =>
        allowedBoardSizes.includes(size),
      ),
    };
  }
}
