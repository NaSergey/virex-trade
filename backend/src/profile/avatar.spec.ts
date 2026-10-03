import { AVATAR_MAX_BYTES, avatarUrl, sniffImage } from './avatar';

const bytes = (...b: number[]) => Buffer.from([...b, ...new Array(16).fill(0)]);

describe('sniffImage', () => {
  it('узнаёт PNG, JPEG и WebP по первым байтам', () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);
    expect(sniffImage(webp)).toBe('image/webp');
  });

  it('отказывает SVG, GIF, HTML и обрывкам', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a........'))).toBeNull();
    expect(sniffImage(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImage(Buffer.from([0x89, 0x50]))).toBeNull();
    // RIFF без WEBP — это WAV/AVI, а не картинка.
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]))).toBeNull();
  });

  it('предел размера — полмегабайта', () => {
    expect(AVATAR_MAX_BYTES).toBe(512 * 1024);
  });
});

describe('avatarUrl', () => {
  it('нет картинки — null', () => {
    expect(avatarUrl('u1', null)).toBeNull();
  });

  it('адрес несёт версию — время загрузки в мс', () => {
    expect(avatarUrl('u1', new Date(1_700_000_000_123))).toBe('/api/profile/u1/avatar?v=1700000000123');
  });
});
