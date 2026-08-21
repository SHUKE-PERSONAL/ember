import { useEffect, useState } from 'react';
import { api, ApiError, type Post, type User } from '../api';
import { PostItem } from './PostItem';

export function Topic({
  tag,
  user,
  logout,
}: {
  tag: string;
  user: User;
  logout: () => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.topicPosts(tag)
      .then((page) => {
        if (!active) return;
        setPosts(page.posts);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'could not load topic');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tag]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api.topicPosts(tag, nextCursor);
      setPosts((previous) => [...previous, ...page.posts]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not load more posts');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="app">
      <header className="topbar">
        <h1><a href="/" className="brand-link">Ember</a></h1>
        <nav className="who">
          <a href="/search">Search</a>
          <a className="handle profile-link" href={`/@${encodeURIComponent(user.handle)}`}>
            @{user.handle}
          </a>
          <button type="button" className="link" onClick={logout}>
            Log out
          </button>
        </nav>
      </header>

      <a className="back-link" href="/">← Home</a>
      <h2 className="section-title">#{tag}</h2>
      {loading && <p className="muted">Loading topic…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && posts.length === 0 && (
        <p className="muted empty">No posts found for #{tag}.</p>
      )}
      <div className="timeline">
        {posts.map((post) => <PostItem key={post.id} post={post} />)}
        {nextCursor && (
          <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </main>
  );
}
