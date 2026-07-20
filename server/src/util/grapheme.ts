// Grapheme-aware length. A "character" to a human is a grapheme cluster, not a
// UTF-16 code unit: an emoji or a 汉字 is one grapheme but can be several code
// units. Intl.Segmenter gives us the user-perceived count, so a 140-汉字 post
// counts as 140. Shared by the post-create length check (#3).

// 140-grapheme soft hint (the compose counter marks this but never blocks).
export const SOFT_LIMIT = 140;
// 1024-grapheme anti-abuse ceiling — the only server-enforced limit.
export const MAX_GRAPHEMES = 1024;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemeCount(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}
