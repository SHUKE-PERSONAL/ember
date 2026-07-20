import { useState } from 'react';
import { type Post } from '../api';
import { foldAt, SOFT_LIMIT } from '../lib/grapheme';
import { relativeTime } from '../lib/relativeTime';

// A single timeline post. Text longer than 140 graphemes folds to the first
// 140 with a 展开 / "Show more" toggle; full text is always present client-side.
export function PostItem({ post }: { post: Post }) {
  const [expanded, setExpanded] = useState(false);
  const { head, truncated } = foldAt(post.text, SOFT_LIMIT);

  return (
    <article className="post">
      <header>
        <span className="name">{post.author.displayName}</span>
        <span className="handle">@{post.author.handle}</span>
        <span className="dot">·</span>
        <time dateTime={post.createdAt}>{relativeTime(post.createdAt)}</time>
      </header>
      <p className="body">
        {truncated && !expanded ? `${head}…` : post.text}
        {truncated && (
          <button type="button" className="link more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '收起 / Show less' : '展开 / Show more'}
          </button>
        )}
      </p>
    </article>
  );
}
