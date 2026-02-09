import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RequestPrincipal } from '../common/types/domain.types';
import { createId, createInviteCode } from '../common/utils/crypto.util';
import { RealtimeService } from '../realtime/realtime.service';
import { InMemoryStore } from '../store/in-memory.store';
import { RoomsService } from '../rooms/rooms.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JoinInviteDto } from './dto/join-invite.dto';

@Injectable()
export class InvitesService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly roomsService: RoomsService,
    private readonly authService: AuthService,
    private readonly realtimeService: RealtimeService,
  ) {}

  createInvite(
    roomId: string,
    principal: RequestPrincipal,
    dto: CreateInviteDto,
  ): Record<string, unknown> {
    const creatorMember = this.roomsService.ensureHostMember(roomId, principal);
    const room = this.roomsService.getRoomById(roomId);

    const invite = {
      _id: createId(),
      roomId,
      code: this.createUniqueCode(),
      createdByMemberId: creatorMember._id,
      allowGuestJoin: dto.allowGuestJoin ?? room.settings.allowGuestJoin,
      maxUses: dto.maxUses,
      usesCount: 0,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      revokedAt: undefined as Date | undefined,
      createdAt: new Date(),
    };

    this.store.invites.set(invite._id, invite);
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

  resolveInvite(code: string): Record<string, unknown> {
    const invite = this.requireInviteByCode(code);
    const room = this.roomsService.getRoomById(invite.roomId);
    return {
      invite: {
        id: invite._id,
        code: invite.code,
        allowGuestJoin: invite.allowGuestJoin,
        expiresAt: invite.expiresAt,
        maxUses: invite.maxUses,
        usesCount: invite.usesCount,
      },
      room: {
        id: room._id,
        name: room.name,
        type: room.type,
      },
    };
  }

  joinInvite(
    code: string,
    dto: JoinInviteDto,
    principal?: RequestPrincipal,
  ): Record<string, unknown> {
    const invite = this.requireInviteByCode(code);
    const room = this.roomsService.getRoomById(invite.roomId);

    if (invite.maxUses !== undefined && invite.usesCount >= invite.maxUses) {
      throw new BadRequestException({
        code: 'INVITE_MAX_USES_REACHED',
        message: 'Invite has reached its usage limit.',
        details: {},
      });
    }

    const sanitizedDisplayName = this.getUniqueDisplayName(room._id, dto.displayName.trim());
    let member;
    let guestToken: string | undefined;

    if (principal?.kind === 'user') {
      member = this.roomsService.createOrReactivateUserMember(
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
      member = this.roomsService.createGuestMember(
        room._id,
        guestSessionId,
        sanitizedDisplayName,
      );
      guestToken = this.authService.createGuestToken(member);
    }

    invite.usesCount += 1;
    this.store.invites.set(invite._id, invite);
    this.roomsService.touchRoomActivity(room._id);
    this.realtimeService.publishRoomUpdate(room._id, 'member.joined', {
      roomId: room._id,
      memberId: member._id,
      displayName: member.displayName,
    });

    return {
      member,
      guestToken,
      room: this.roomsService.getRoomById(room._id),
    };
  }

  revokeInvite(roomId: string, inviteId: string, principal: RequestPrincipal): Record<string, unknown> {
    this.roomsService.ensureHostMember(roomId, principal);
    const invite = this.store.invites.get(inviteId);
    if (!invite || invite.roomId !== roomId) {
      throw new NotFoundException({
        code: 'INVITE_NOT_FOUND',
        message: 'Invite was not found.',
        details: {},
      });
    }
    invite.revokedAt = new Date();
    this.store.invites.set(invite._id, invite);
    this.realtimeService.publishRoomUpdate(roomId, 'invite.revoked', {
      roomId,
      inviteId,
    });
    return { invite };
  }

  private requireInviteByCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    const invite = [...this.store.invites.values()].find(
      (candidate) => candidate.code === normalizedCode,
    );
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

  private createUniqueCode(): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = createInviteCode();
      const exists = [...this.store.invites.values()].some(
        (invite) => invite.code === code && !invite.revokedAt,
      );
      if (!exists) {
        return code;
      }
    }
    return `${createInviteCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
  }

  private getUniqueDisplayName(roomId: string, desiredName: string): string {
    const base = desiredName || 'Guest';
    const activeNames = new Set(
      this.roomsService
        .listRoomMembers(roomId)
        .map((member) => member.displayName.toLowerCase()),
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
