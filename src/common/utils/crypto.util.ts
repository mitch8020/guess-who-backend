import { createHash, randomBytes, randomUUID } from 'crypto';
import { INVITE_CODE_LENGTH } from '../constants';

export const createId = (): string => randomUUID();

export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');

export const createRandomHex = (bytes: number): string =>
  randomBytes(bytes).toString('hex');

export const createInviteCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
};

export const shuffle = <T>(items: T[]): T[] => {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const randomValue = randomBytes(4).readUInt32BE(0);
    const j = randomValue % (i + 1);
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
};

export const pickRandom = <T>(items: T[]): T => {
  const index = randomBytes(4).readUInt32BE(0) % items.length;
  return items[index];
};

export const parseDurationMs = (value: string): number => {
  const trimmed = value.trim();
  const match = /^(\d+)([smhd])$/.exec(trimmed);
  if (!match) {
    throw new Error(`Unsupported duration format: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit];
};
