import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const MODEL_NAMES = {
  User: 'User',
  Room: 'Room',
  RoomMember: 'RoomMember',
  RoomImage: 'RoomImage',
  Invite: 'Invite',
  Match: 'Match',
  MatchParticipant: 'MatchParticipant',
  MatchAction: 'MatchAction',
  RefreshSession: 'RefreshSession',
  OAuthState: 'OAuthState',
  ChatMessage: 'ChatMessage',
} as const;

@Schema({ _id: false, versionKey: false })
export class RoomSettingsDocument {
  @Prop({ type: [Number], required: true, default: [4, 5, 6] })
  allowedBoardSizes!: number[];

  @Prop({ type: Number, required: true, default: 2 })
  minPlayers!: number;

  @Prop({ type: Number, required: true, default: 8 })
  maxPlayers!: number;

  @Prop({ type: Boolean, required: true, default: true })
  allowGuestJoin!: boolean;

  @Prop({ type: Number })
  defaultBoardSize?: number;

  @Prop({ type: [Number], default: [] })
  rematchBoardSizes!: number[];
}

export const RoomSettingsSchema = SchemaFactory.createForClass(RoomSettingsDocument);

@Schema({ collection: 'users', versionKey: false })
export class UserDocument {
  @Prop({ required: true, unique: true })
  googleId!: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email!: string;

  @Prop({ required: true })
  displayName!: string;

  @Prop()
  avatarUrl?: string;

  @Prop({ required: true, enum: ['active', 'disabled'], default: 'active' })
  status!: 'active' | 'disabled';

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  updatedAt!: Date;

  @Prop({ required: true })
  lastLoginAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(UserDocument);

@Schema({ collection: 'rooms', versionKey: false })
export class RoomDocument {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, enum: ['temporary', 'permanent'] })
  type!: 'temporary' | 'permanent';

  @Prop({ required: true })
  hostUserId!: string;

  @Prop({ type: RoomSettingsSchema, required: true })
  settings!: RoomSettingsDocument;

  @Prop()
  temporaryExpiresAt?: Date;

  @Prop({ required: true })
  lastActivityAt!: Date;

  @Prop({ required: true, default: false })
  isArchived!: boolean;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  updatedAt!: Date;
}

export const RoomSchema = SchemaFactory.createForClass(RoomDocument);
RoomSchema.index({ hostUserId: 1 });
RoomSchema.index({ type: 1, temporaryExpiresAt: 1 });
RoomSchema.index({ isArchived: 1, lastActivityAt: 1 });

@Schema({ collection: 'room_members', versionKey: false })
export class RoomMemberDocument {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ index: true })
  userId?: string;

  @Prop({ index: true })
  guestSessionId?: string;

  @Prop({ required: true })
  displayName!: string;

  @Prop({ required: true, enum: ['host', 'player'] })
  role!: 'host' | 'player';

  @Prop({ required: true, enum: ['active', 'left', 'kicked'], default: 'active' })
  status!: 'active' | 'left' | 'kicked';

  @Prop()
  mutedUntil?: Date;

  @Prop({ required: true })
  joinedAt!: Date;

  @Prop({ required: true })
  lastSeenAt!: Date;
}

export const RoomMemberSchema = SchemaFactory.createForClass(RoomMemberDocument);
RoomMemberSchema.index(
  { roomId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true, $type: 'string' } } },
);
RoomMemberSchema.index(
  { roomId: 1, guestSessionId: 1 },
  { unique: true, partialFilterExpression: { guestSessionId: { $exists: true, $type: 'string' } } },
);

@Schema({ collection: 'room_images', versionKey: false })
export class RoomImageDocument {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true })
  uploaderMemberId!: string;

  @Prop({ required: true })
  storageFileId!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  width!: number;

  @Prop({ required: true })
  height!: number;

  @Prop({ required: true })
  fileSizeBytes!: number;

  @Prop({ required: true })
  sha256!: string;

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ required: true })
  createdAt!: Date;
}

export const RoomImageSchema = SchemaFactory.createForClass(RoomImageDocument);
RoomImageSchema.index({ roomId: 1, isActive: 1 });
RoomImageSchema.index(
  { roomId: 1, sha256: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

@Schema({ collection: 'invites', versionKey: false })
export class InviteDocument {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true, unique: true, uppercase: true })
  code!: string;

  @Prop({ required: true })
  createdByMemberId!: string;

  @Prop({ required: true })
  allowGuestJoin!: boolean;

  @Prop()
  maxUses?: number;

  @Prop({ required: true, default: 0 })
  usesCount!: number;

  @Prop()
  expiresAt?: Date;

  @Prop()
  revokedAt?: Date;

  @Prop({ required: true })
  createdAt!: Date;
}

export const InviteSchema = SchemaFactory.createForClass(InviteDocument);
InviteSchema.index({ roomId: 1, revokedAt: 1 });
InviteSchema.index({ expiresAt: 1, revokedAt: 1 });

@Schema({ collection: 'matches', versionKey: false })
export class MatchDocument {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true, enum: ['waiting', 'in_progress', 'completed', 'cancelled'] })
  status!: 'waiting' | 'in_progress' | 'completed' | 'cancelled';

  @Prop({ required: true })
  boardSize!: number;

  @Prop({ required: true, type: [String] })
  selectedImageIds!: string[];

  @Prop({ required: true })
  startedByMemberId!: string;

  @Prop()
  turnMemberId?: string;

  @Prop()
  winnerMemberId?: string;

  @Prop({ required: true })
  randomizationSeedHash!: string;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  updatedAt!: Date;
}

export const MatchSchema = SchemaFactory.createForClass(MatchDocument);
MatchSchema.index({ roomId: 1, createdAt: -1 });
MatchSchema.index({ roomId: 1, status: 1, createdAt: -1 });

@Schema({ collection: 'match_participants', versionKey: false })
export class MatchParticipantDocument {
  @Prop({ required: true, index: true })
  matchId!: string;

  @Prop({ required: true })
  roomMemberId!: string;

  @Prop({ required: true, type: [String] })
  boardImageOrder!: string[];

  @Prop({ required: true })
  secretTargetImageId!: string;

  @Prop({ required: true, type: [String], default: [] })
  eliminatedImageIds!: string[];

  @Prop({ required: true, enum: ['in_progress', 'guessed_correct', 'guessed_wrong', 'timeout'] })
  result!: 'in_progress' | 'guessed_correct' | 'guessed_wrong' | 'timeout';

  @Prop({ required: true })
  readyAt!: Date;

  @Prop({ required: true })
  lastActionAt!: Date;
}

export const MatchParticipantSchema = SchemaFactory.createForClass(MatchParticipantDocument);
MatchParticipantSchema.index({ matchId: 1, roomMemberId: 1 }, { unique: true });
MatchParticipantSchema.index({ matchId: 1, result: 1 });

@Schema({ collection: 'match_actions', versionKey: false })
export class MatchActionDocument {
  @Prop({ required: true, index: true })
  matchId!: string;

  @Prop()
  actorMemberId?: string;

  @Prop({ required: true, enum: ['ask', 'answer', 'eliminate', 'guess', 'system'] })
  actionType!: 'ask' | 'answer' | 'eliminate' | 'guess' | 'system';

  @Prop({ required: true, type: Object })
  payload!: Record<string, unknown>;

  @Prop({ required: true })
  createdAt!: Date;
}

export const MatchActionSchema = SchemaFactory.createForClass(MatchActionDocument);
MatchActionSchema.index({ matchId: 1, createdAt: 1 });

@Schema({ collection: 'refresh_sessions', versionKey: false })
export class RefreshSessionDocument {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true })
  tokenHash!: string;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  revokedAt?: Date;
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSessionDocument);

@Schema({ collection: 'oauth_states', versionKey: false })
export class OAuthStateDocument {
  @Prop({ required: true, unique: true })
  state!: string;

  @Prop({ required: true })
  createdAt!: Date;

  @Prop({ required: true, expires: 0 })
  expiresAt!: Date;

  @Prop()
  redirectTo?: string;
}

export const OAuthStateSchema = SchemaFactory.createForClass(OAuthStateDocument);

@Schema({ collection: 'chat_messages', versionKey: false })
export class ChatMessageDocument {
  @Prop({ required: true, index: true })
  roomId!: string;

  @Prop({ required: true })
  memberId!: string;

  @Prop({ required: true, maxlength: 1000 })
  message!: string;

  @Prop({ required: true })
  createdAt!: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessageDocument);
ChatMessageSchema.index({ roomId: 1, createdAt: -1 });

export const PERSISTENCE_MODELS = [
  { name: MODEL_NAMES.User, schema: UserSchema },
  { name: MODEL_NAMES.Room, schema: RoomSchema },
  { name: MODEL_NAMES.RoomMember, schema: RoomMemberSchema },
  { name: MODEL_NAMES.RoomImage, schema: RoomImageSchema },
  { name: MODEL_NAMES.Invite, schema: InviteSchema },
  { name: MODEL_NAMES.Match, schema: MatchSchema },
  { name: MODEL_NAMES.MatchParticipant, schema: MatchParticipantSchema },
  { name: MODEL_NAMES.MatchAction, schema: MatchActionSchema },
  { name: MODEL_NAMES.RefreshSession, schema: RefreshSessionSchema },
  { name: MODEL_NAMES.OAuthState, schema: OAuthStateSchema },
  { name: MODEL_NAMES.ChatMessage, schema: ChatMessageSchema },
];
