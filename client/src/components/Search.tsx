import { useEffect, useState } from 'react';
import { api, ApiError, type Author, type Post, type User } from '../api';
import { PostItem } from './PostItem';

export function Search({
  query,
  user,
  logout,
}: {
  query: string;
  user: User;
  logout: () => void;
}) {
  const [input, setInput] = useState(query);
  const [posts, setPosts] = useState<Post[]>([]);
  const [userResults, setUserResults] = useState<Author[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.search(query)
      .then((results) => {
        if (!active) return;
        setPosts(results.posts);
        setUserResults(results.users);
        setNextCursor(results.nextCursor);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'could not search');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const results = await api.search(query, nextCursor);
      setPosts((previous) => [...previous, ...results.posts]);
      setNextCursor(results.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not load more posts');
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextQuery = input.trim();
    window.location.href = nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : '/search';
  };

  const hasResults = posts.length > 0 || userResults.length > 0;

  return (
    <main className="app">
      <header className="topbar">
        <h1><a href="/" className="brand-link">Ember</a></h1>
        <nav className="who">
          <a className="handle profile-link" href={`/@${encodeURIComponent(user.handle)}`}>
            @{user.handle}
          </a>
          <button type="button" className="link" onClick={logout}>
            Log out
          </button>
        </nav>
      </header>

      <a className="back-link" href="/">← Home</a>
      <form className="search-form" onSubmit={submit}>
        <label htmlFor="search-query">Search</label>
        <div>
          <input
            id="search-query"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search posts and people"
          />
          <button type="submit">Search</button>
        </div>
      </form>
      {query && <h2 className="section-title">Results for “{query}”</h2>}
      {loading && <p className="muted">Searching…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && !hasResults && (
        <p className="muted empty">No results found.</p>
      )}
      {!loading && !error && userResults.length > 0 && (
        <section aria-label="Matching users">
          <h2 className="section-title">People</h2>
          <div className="search-users">
            {userResults.map((result) => (
              <a key={result.id} className="search-user" href={`/@${encodeURIComponent(result.handle)}`}>
                <strong>{result.displayName}</strong> <span className="muted">@{result.handle}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      {!loading && !error && posts.length > 0 && (
        <section aria-label="Matching posts">
          <h2 className="section-title">Posts</h2>
          <div className="timeline">
            {posts.map((post) => <PostItem key={post.id} post={post} />)}
            {nextCursor && (
              <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
