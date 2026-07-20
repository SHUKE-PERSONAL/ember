// Grapheme-aware helpers for the compose counter and timeline fold. A human
// "character" is a grapheme cluster (an emoji or 汉字 is one), so we measure
// and slice by segment, not by UTF-16 code unit. Mirrors the server's limits.

export const SOFT_LIMIT = 140;
export const MAX_GRAPHEMES = 1024;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemeCount(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

// Fold long text for the timeline: returns the first `limit` graphemes plus
// whether anything was cut. Slicing by segment avoids splitting an emoji.
export function foldAt(text: string, limit = SOFT_LIMIT): { head: string; truncated: boolean } {
  let head = '';
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (count >= limit) return { head, truncated: true };
    head += segment;
    count++;
  }
  return { head, truncated: false };
}
