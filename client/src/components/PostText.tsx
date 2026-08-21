import { Fragment } from 'react';

const TOKEN_PATTERN = /[@#][\p{L}\p{N}_-]+/gu;
const TOKEN_CHARACTER = /[\p{L}\p{N}_-]/u;

export function PostText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    const previous = start > 0 ? text[start - 1] : undefined;
    if (previous && TOKEN_CHARACTER.test(previous)) continue;

    if (start > cursor) parts.push(text.slice(cursor, start));
    const value = token.slice(1);
    const href = token[0] === '@'
      ? `/@${encodeURIComponent(value)}`
      : `/topic/${encodeURIComponent(value.toLowerCase())}`;
    parts.push(
      <a key={`${start}-${token}`} href={href}>
        {token}
      </a>,
    );
    cursor = start + token.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  if (parts.length === 0) return <>{text}</>;

  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}
