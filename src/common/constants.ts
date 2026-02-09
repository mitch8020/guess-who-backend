export const API_PREFIX = 'api';

export const ROOM_DEFAULTS = {
  allowedBoardSizes: [4, 5, 6],
  minPlayers: 2,
  maxPlayers: Number(process.env.MAX_ROOM_PLAYERS_DEFAULT ?? 8),
  hardMaxPlayers: 20,
  temporaryTtlHours: Number(process.env.TEMP_ROOM_TTL_HOURS ?? 24),
} as const;

export const MATCH_MIN_IMAGES = 16;
export const MAX_ACTIVE_MATCHES_PER_ROOM = Number(process.env.MAX_ACTIVE_MATCHES_PER_ROOM ?? 1);
export const INVITE_CODE_LENGTH = 8;
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 10);

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
