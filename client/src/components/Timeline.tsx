import { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { api, type Post } from '../api';
import { PostItem } from './PostItem';

export interface TimelineHandle {
  // Prepend a just-created post so it appears immediately (#3 AC).
  prepend: (post: Post) => void;
}

// Home timeline: self + followed authors, newest first, cursor-paginated.
export const Timeline = forwardRef<TimelineHandle>(function Timeline(_props, ref) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useImperativeHandle(ref, () => ({
    prepend: (post) => setPosts((prev) => [post, ...prev]),
  }));

  useEffect(() => {
    api.timeline()
      .then((t) => {
        setPosts(t.posts);
        setNextCursor(t.nextCursor);
      })
      .catch(() => setError('could not load your timeline'))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const t = await api.timeline(nextCursor);
      setPosts((prev) => [...prev, ...t.posts]);
      setNextCursor(t.nextCursor);
    } catch {
      setError('could not load more');
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <p className="muted">Loading your timeline…</p>;
  if (error) return <p className="error">{error}</p>;
  if (posts.length === 0) {
    return <p className="muted empty">Nothing here yet. Follow someone, or write the first post.</p>;
  }

  return (
    <div className="timeline">
      {posts.map((p) => (
        <PostItem key={p.id} post={p} />
      ))}
      {nextCursor && (
        <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
});
