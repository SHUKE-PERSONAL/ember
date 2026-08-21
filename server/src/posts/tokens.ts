export type PostTokenType = 'mention' | 'topic';

export interface PostToken {
  type: PostTokenType;
  value: string;
}

const TOKEN_PATTERN = /[@#][\p{L}\p{N}_-]+/gu;
const TOKEN_CHARACTER = /[\p{L}\p{N}_-]/u;
const VALID_TOPIC = /^[\p{L}\p{N}_-]+$/u;

export function extractPostTokens(text: string): PostToken[] {
  const tokens: PostToken[] = [];

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index ?? 0;
    const previous = start > 0 ? text[start - 1] : undefined;
    if (previous && TOKEN_CHARACTER.test(previous)) continue;

    const token = match[0];
    tokens.push({
      type: token[0] === '@' ? 'mention' : 'topic',
      value: token.slice(1),
    });
  }

  return tokens;
}

export function normalizeTopicTag(value: string) {
  const tag = value.trim().replace(/^#/, '');
  return VALID_TOPIC.test(tag) ? tag.toLowerCase() : null;
}

export function postHasTopic(text: string, tag: string) {
  const normalizedTag = normalizeTopicTag(tag);
  if (!normalizedTag) return false;

  return extractPostTokens(text).some(
    (token) => token.type === 'topic' && token.value.toLowerCase() === normalizedTag,
  );
}
