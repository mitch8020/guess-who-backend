export const API_PREFIX = 'api';

export const ROOM_DEFAULTS = {
  allowedBoardSizes: [4, 5, 6],
  minPlayers: 2,
  maxPlayers: 8,
  hardMaxPlayers: 20,
  temporaryTtlHours: 24,
} as const;

export const MATCH_MIN_IMAGES = 16;
export const INVITE_CODE_LENGTH = 8;
export const MAX_UPLOAD_MB = 10;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
