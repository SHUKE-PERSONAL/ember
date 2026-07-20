import { describe, it, expect } from 'vitest';
import { graphemeCount, SOFT_LIMIT, MAX_GRAPHEMES } from './grapheme.js';

describe('graphemeCount', () => {
  it('counts ASCII by character', () => {
    expect(graphemeCount('')).toBe(0);
    expect(graphemeCount('hello')).toBe(5);
  });

  it('counts each 汉字 as one grapheme', () => {
    const han = '你好世界';
    expect(graphemeCount(han)).toBe(4);
    // 140 汉字 sits exactly on the soft limit, not above it.
    expect(graphemeCount('字'.repeat(SOFT_LIMIT))).toBe(SOFT_LIMIT);
  });

  it('counts a multi-code-unit emoji / ZWJ sequence as one grapheme', () => {
    expect(graphemeCount('🔥')).toBe(1);
    // Family emoji is several code points joined by ZWJ — still one grapheme.
    expect(graphemeCount('👨‍👩‍👧‍👦')).toBe(1);
    expect(graphemeCount('a🔥b')).toBe(3);
  });

  it('measures the ceiling by grapheme, so a 1024-🔥 post is at the limit', () => {
    expect(graphemeCount('🔥'.repeat(MAX_GRAPHEMES))).toBe(MAX_GRAPHEMES);
    expect(graphemeCount('🔥'.repeat(MAX_GRAPHEMES + 1))).toBe(MAX_GRAPHEMES + 1);
  });
});
