import { describe, expect, it } from 'vitest';
import { decodeMixedAnsi, parseAnsiScreen } from './ansi';

describe('SHUKE.ANS decoding', () => {
  it('keeps CP437 border bytes as box-drawing characters', () => {
    expect(decodeMixedAnsi(Uint8Array.of(0xc9, 0xcd, 0xcd, 0xbb))).toBe('╔══╗');
  });

  it('decodes GBK greeting bytes without corrupting the border', () => {
    const greeting = Uint8Array.of(
      0xbb,
      0xb6,
      0xd3,
      0xad,
      0xb9,
      0xe2,
      0xc1,
      0xd9,
      0xca,
      0xe6,
      0xbf,
      0xcb,
      0x42,
      0x42,
      0x53,
      0xd2,
      0xbb,
      0xcf,
      0xdf,
    );
    expect(decodeMixedAnsi(greeting)).toBe('欢迎光临舒克BBS一线');
  });

  it('applies the original ANSI palette while parsing lines', () => {
    const screen = parseAnsiScreen(Uint8Array.of(
      0x1b,
      0x5b,
      0x33,
      0x34,
      0x3b,
      0x34,
      0x34,
      0x6d,
      0x20,
      0x1b,
      0x5b,
      0x31,
      0x3b,
      0x33,
      0x32,
      0x6d,
      0xc9,
      0xcd,
      0xbb,
      0x20,
      0x1b,
      0x5b,
      0x30,
      0x6d,
      0x0d,
      0x0a,
    ));

    expect(screen[0][1]).toMatchObject({
      character: '╔',
      style: { bold: true, foreground: 2, background: 4 },
    });
  });
});
