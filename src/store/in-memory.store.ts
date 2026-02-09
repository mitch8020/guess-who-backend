import { Injectable } from '@nestjs/common';
import {
  InviteRecord,
  MatchActionRecord,
  MatchParticipantRecord,
  MatchRecord,
  OAuthStateRecord,
  RefreshSessionRecord,
  RoomImageRecord,
  RoomMemberRecord,
  RoomRecord,
  UserRecord,
} from '../common/types/domain.types';

@Injectable()
export class InMemoryStore {
  readonly users = new Map<string, UserRecord>();
  readonly rooms = new Map<string, RoomRecord>();
  readonly roomMembers = new Map<string, RoomMemberRecord>();
  readonly invites = new Map<string, InviteRecord>();
  readonly images = new Map<string, RoomImageRecord>();
  readonly imageBuffers = new Map<string, Buffer>();
  readonly matches = new Map<string, MatchRecord>();
  readonly matchParticipants = new Map<string, MatchParticipantRecord>();
  readonly matchActions = new Map<string, MatchActionRecord[]>();
  readonly refreshSessions = new Map<string, RefreshSessionRecord>();
  readonly oauthStates = new Map<string, OAuthStateRecord>();
}
