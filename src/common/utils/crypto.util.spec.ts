import {
  createInviteCode,
  createRandomHex,
  parseDurationMs,
  pickRandom,
  sha256,
  shuffle,
} from './crypto.util';

describe('crypto util', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates random hex with expected length', () => {
    const value = createRandomHex(8);
    expect(value).toMatch(/^[0-9a-f]+$/);
    expect(value).toHaveLength(16);
  });

  it('creates invite code with allowed characters', () => {
    const code = createInviteCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    expect(code).toHaveLength(8);
  });

  it('hashes values with sha256', () => {
    expect(sha256('hello')).toHaveLength(64);
    expect(sha256('hello')).toBe(sha256(Buffer.from('hello')));
  });

  it('shuffles and pickRandom deterministically when random bytes are mocked', () => {
    const randomBytesSpy = jest.spyOn(require('crypto'), 'randomBytes');
    randomBytesSpy.mockImplementation((size: number) => {
      if (size === 4) {
        return Buffer.from([0, 0, 0, 0]);
      }
      return Buffer.alloc(size, 1);
    });

    expect(shuffle([1, 2, 3])).toEqual([2, 3, 1]);
    expect(pickRandom(['a', 'b', 'c'])).toBe('a');
  });

  it('parses supported duration formats', () => {
    expect(parseDurationMs('10s')).toBe(10_000);
    expect(parseDurationMs('5m')).toBe(300_000);
    expect(parseDurationMs('2h')).toBe(7_200_000);
    expect(parseDurationMs('1d')).toBe(86_400_000);
    expect(() => parseDurationMs('10x')).toThrow('Unsupported duration format');
  });
});
