import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { InviteDocument, MODEL_NAMES } from '../common/schemas/persistence.schemas';
import { RequestPrincipal } from '../common/types/domain.types';
import { createId, createInviteCode } from '../common/utils/crypto.util';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsService } from '../rooms/rooms.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JoinInviteDto } from './dto/join-invite.dto';

@Injectable()
export class InvitesService {
  constructor(
    @InjectModel(MODEL_NAMES.Invite)
    private readonly inviteModel: Model<InviteDocument>,
    private readonly roomsService: RoomsService,
    private readonly authService: AuthService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async createInvite(
    roomId: string,
    principal: RequestPrincipal,
    dto: CreateInviteDto,
  ): Promise<Record<string, unknown>> {
    const creatorMember = await this.roomsService.ensureHostMember(roomId, principal);
    const room = await this.roomsService.getRoomById(roomId);

    const invite = {
      _id: createId(),
      roomId,
      code: await this.createUniqueCode(),
      createdByMemberId: creatorMember._id,
      allowGuestJoin: dto.allowGuestJoin ?? room.settings.allowGuestJoin,
      maxUses: dto.maxUses,
      usesCount: 0,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      revokedAt: undefined as Date | undefined,
      createdAt: new Date(),
    };

    await this.inviteModel.create(invite);
    this.realtimeService.publishRoomUpdate(roomId, 'invite.created', {
      roomId,
      inviteId: invite._id,
      code: invite.code,
    });
    return {
      invite,
      shareUrl: `/join/${invite.code}`,
    };
  }

  async resolveInvite(code: string): Promise<Record<string, unknown>> {
    const invite = await this.requireInviteByCode(code);
    const room = await this.roomsService.getRoomById(invite.roomId);
    return {
      invite: {
        _id: invite._id,
        code: invite.code,
        allowGuestJoin: invite.allowGuestJoin,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        usesCount: invite.usesCount,
      },
      room: {
        _id: room._id,
        name: room.name,
        type: room.type,
      },
    };
  }

  async joinInvite(
    code: string,
    dto: JoinInviteDto,
    principal?: RequestPrincipal,
  ): Promise<Record<string, unknown>> {
    const invite = await this.requireInviteByCode(code);
    const room = await this.roomsService.getRoomById(invite.roomId);

    if (invite.maxUses !== undefined && invite.usesCount >= invite.maxUses) {
      throw new BadRequestException({
        code: 'INVITE_MAX_USES_REACHED',
        message: 'Invite has reached its usage limit.',
        details: {},
      });
    }

    const sanitizedDisplayName = await this.getUniqueDisplayName(room._id, dto.displayName.trim());
    let member;
    let guestToken: string | undefined;

    if (principal?.kind === 'user') {
      member = await this.roomsService.createOrReactivateUserMember(
        room._id,
        principal.userId,
        sanitizedDisplayName,
      );
    } else {
      if (!invite.allowGuestJoin || !room.settings.allowGuestJoin) {
        throw new ForbiddenException({
          code: 'GUEST_JOIN_DISABLED',
          message: 'Guests are not allowed to join this room.',
          details: {},
        });
      }
      const guestSessionId = createId();
      member = await this.roomsService.createGuestMember(
        room._id,
        guestSessionId,
        sanitizedDisplayName,
      );
      guestToken = this.authService.createGuestToken(member);
    }

    await this.inviteModel
      .updateOne({ _id: invite._id }, { $inc: { usesCount: 1 } })
      .exec();
    await this.roomsService.touchRoomActivity(room._id);
    this.realtimeService.publishRoomUpdate(room._id, 'member.joined', {
      roomId: room._id,
      memberId: member._id,
      displayName: member.displayName,
    });

    return {
      member,
      guestToken,
      room: await this.roomsService.getRoomById(room._id),
    };
  }

  async revokeInvite(
    roomId: string,
    inviteId: string,
    principal: RequestPrincipal,
  ): Promise<Record<string, unknown>> {
    await this.roomsService.ensureHostMember(roomId, principal);
    const invite = await this.inviteModel
      .findOne({ _id: inviteId, roomId })
      .lean<any>()
      .exec();
    if (!invite) {
      throw new NotFoundException({
        code: 'INVITE_NOT_FOUND',
        message: 'Invite was not found.',
        details: {},
      });
    }

    await this.inviteModel
      .updateOne({ _id: inviteId }, { $set: { revokedAt: new Date() } })
      .exec();
    this.realtimeService.publishRoomUpdate(roomId, 'invite.revoked', {
      roomId,
      inviteId,
    });
    return { invite: { ...invite, revokedAt: new Date() } };
  }

  private async requireInviteByCode(code: string): Promise<any> {
    const normalizedCode = code.trim().toUpperCase();
    const invite = await this.inviteModel
      .findOne({ code: normalizedCode })
      .lean<any>()
      .exec();
    if (!invite || invite.revokedAt) {
      throw new NotFoundException({
        code: 'INVITE_INVALID',
        message: 'Invite does not exist or has been revoked.',
        details: {},
      });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'INVITE_EXPIRED',
        message: 'Invite has expired.',
        details: {},
      });
    }
    return invite;
  }

  private async createUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = createInviteCode();
      const exists = await this.inviteModel.exists({ code, revokedAt: { $exists: false } });
      if (!exists) {
        return code;
      }
    }
    return `${createInviteCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
  }

  private async getUniqueDisplayName(roomId: string, desiredName: string): Promise<string> {
    const base = desiredName || 'Guest';
    const activeNames = new Set(
      (await this.roomsService.listRoomMembers(roomId)).map((member) => member.displayName.toLowerCase()),
    );
    if (!activeNames.has(base.toLowerCase())) {
      return base;
    }
    for (let index = 2; index < 999; index += 1) {
      const candidate = `${base}-${index}`;
      if (!activeNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `${base}-${Date.now().toString(36).toUpperCase()}`;
  }
}
