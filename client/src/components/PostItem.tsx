import { useState } from 'react';
import { api, ApiError, type Post } from '../api';
import { foldAt, SOFT_LIMIT } from '../lib/grapheme';
import { relativeTime } from '../lib/relativeTime';
import { PostText } from './PostText';

// A single timeline post. Text longer than 140 graphemes folds to the first
// 140 with a 展开 / "Show more" toggle; full text is always present client-side.
export function PostItem({ post, fullText = false }: { post: Post; fullText?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [reposted, setReposted] = useState(post.reposted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { head, truncated } = foldAt(post.text, SOFT_LIMIT);
  const originalFolded = post.repostOf ? foldAt(post.repostOf.text, SOFT_LIMIT) : null;
  const showFullText = fullText || expanded;

  const toggleLike = async () => {
    setBusy(true);
    setError(null);
    try {
      const state = liked ? await api.unlike(post.id) : await api.like(post.id);
      setLiked(state.liked);
      setLikeCount(state.likeCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not update like');
    } finally {
      setBusy(false);
    }
  };

  const toggleRepost = async () => {
    const targetId = post.repostOfId ?? post.id;
    setBusy(true);
    setError(null);
    try {
      const state = reposted
        ? await api.unrepost(targetId)
        : await api.repost(targetId);
      setReposted(state.reposted);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not update repost');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="post">
      <header>
        <a className="post-author" href={`/@${encodeURIComponent(post.author.handle)}`}>
          <span className="name">{post.author.displayName}</span>
          <span className="handle">@{post.author.handle}</span>
        </a>
        <span className="dot">·</span>
        <a className="post-time" href={`/posts/${encodeURIComponent(post.id)}`}>
          <time dateTime={post.createdAt}>{relativeTime(post.createdAt)}</time>
        </a>
      </header>
      {post.repostOf ? (
        <div className="repost">
          <p className="repost-label">{post.author.displayName} reposted</p>
          <div className="repost-original">
            <a className="post-author" href={`/@${encodeURIComponent(post.repostOf.author.handle)}`}>
              <span className="name">{post.repostOf.author.displayName}</span>
              <span className="handle">@{post.repostOf.author.handle}</span>
            </a>
            <p className="body">
              <PostText text={showFullText ? post.repostOf.text : (originalFolded?.truncated
                ? `${originalFolded.head}…`
                : post.repostOf.text)} />
              {originalFolded?.truncated && !fullText && (
                <button type="button" className="link more" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? '收起 / Show less' : '展开 / Show more'}
                </button>
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="body">
          <PostText text={showFullText ? post.text : (truncated ? `${head}…` : post.text)} />
          {truncated && !fullText && (
            <button type="button" className="link more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? '收起 / Show less' : '展开 / Show more'}
            </button>
          )}
        </p>
      )}
      <footer className="post-actions">
        <a href={`/posts/${encodeURIComponent(post.id)}`}>Reply</a>
        <button type="button" className="link" onClick={toggleLike} disabled={busy}>
          {liked ? 'Unlike' : 'Like'} · {likeCount}
        </button>
        <button type="button" className="link" onClick={toggleRepost} disabled={busy}>
          {reposted ? 'Unrepost' : 'Repost'}
        </button>
      </footer>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
