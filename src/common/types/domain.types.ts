export type RoomType = 'temporary' | 'permanent';
export type RoomMemberRole = 'host' | 'player';
export type RoomMemberStatus = 'active' | 'left' | 'kicked';
export type MatchStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';
export type MatchParticipantResult =
  | 'in_progress'
  | 'guessed_correct'
  | 'guessed_wrong'
  | 'timeout';
export type MatchActionType =
  | 'ask'
  | 'answer'
  | 'eliminate'
  | 'guess'
  | 'system';

export interface UserRecord {
  _id: string;
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
}

export interface RoomSettings {
  allowedBoardSizes: number[];
  minPlayers: number;
  maxPlayers: number;
  allowGuestJoin: boolean;
  defaultBoardSize?: number;
  rematchBoardSizes?: number[];
}

export interface RoomRecord {
  _id: string;
  name: string;
  type: RoomType;
  hostUserId: string;
  settings: RoomSettings;
  activeMemberCount: number;
  temporaryExpiresAt?: Date;
  lastActivityAt: Date;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomMemberRecord {
  _id: string;
  roomId: string;
  userId?: string;
  guestSessionId?: string;
  displayName: string;
  role: RoomMemberRole;
  status: RoomMemberStatus;
  mutedUntil?: Date;
  joinedAt: Date;
  lastSeenAt: Date;
}

export interface InviteRecord {
  _id: string;
  roomId: string;
  code: string;
  createdByMemberId: string;
  allowGuestJoin: boolean;
  maxUses?: number;
  usesCount: number;
  expiresAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
}

export interface RoomImageRecord {
  _id: string;
  roomId: string;
  uploaderMemberId: string;
  storageFileId: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  sha256: string;
  isActive: boolean;
  createdAt: Date;
}

export interface MatchRecord {
  _id: string;
  roomId: string;
  status: MatchStatus;
  boardSize: number;
  selectedImageIds: string[];
  startedByMemberId: string;
  turnMemberId?: string;
  winnerMemberId?: string;
  randomizationSeedHash: string;
  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchParticipantRecord {
  _id: string;
  matchId: string;
  roomMemberId: string;
  boardImageOrder: string[];
  secretTargetImageId: string;
  eliminatedImageIds: string[];
  result: MatchParticipantResult;
  readyAt: Date;
  lastActionAt: Date;
}

export interface MatchActionRecord {
  _id: string;
  matchId: string;
  actorMemberId?: string;
  actionType: MatchActionType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface ChatMessageRecord {
  _id: string;
  roomId: string;
  memberId: string;
  message: string;
  createdAt: Date;
}

export interface MatchReplayFrame {
  actionId: string;
  actionType: MatchActionType;
  actorMemberId?: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface RefreshSessionRecord {
  _id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

export interface OAuthStateRecord {
  state: string;
  createdAt: Date;
  expiresAt: Date;
  redirectTo?: string;
}

export interface RequestPrincipalUser {
  kind: 'user';
  userId: string;
}

export interface RequestPrincipalGuest {
  kind: 'guest';
  memberId: string;
  roomId: string;
  displayName: string;
}

export type RequestPrincipal = RequestPrincipalUser | RequestPrincipalGuest;
