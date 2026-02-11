import { detectImageMimeType } from './image-signature.util';

describe('detectImageMimeType', () => {
  it('returns null for short buffers', () => {
    expect(detectImageMimeType(Buffer.from([0x01, 0x02]))).toBeNull();
  });

  it('detects jpeg signatures', () => {
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(detectImageMimeType(buffer)).toBe('image/jpeg');
  });

  it('detects png signatures', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(detectImageMimeType(buffer)).toBe('image/png');
  });

  it('detects webp signatures', () => {
    const buffer = Buffer.from('RIFFxxxxWEBPzzzz', 'ascii');
    expect(detectImageMimeType(buffer)).toBe('image/webp');
  });

  it('returns null for unknown signatures', () => {
    const buffer = Buffer.from('abcdefghijkl', 'ascii');
    expect(detectImageMimeType(buffer)).toBeNull();
  });
});
