import { useEffect, useState } from 'react';
import { api, ApiError, type Post, type User } from '../api';
import { graphemeCount, MAX_GRAPHEMES, SOFT_LIMIT } from '../lib/grapheme';
import { PostItem } from './PostItem';

export function PostDetail({
  id,
  user,
  logout,
}: {
  id: string;
  user: User;
  logout: () => void;
}) {
  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Post[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.postDetail(id)
      .then((detail) => {
        if (!active) return;
        setPost(detail.post);
        setReplies(detail.replies);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'could not load post');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const count = graphemeCount(text);
  const overSoft = count > SOFT_LIMIT;
  const overCeiling = count > MAX_GRAPHEMES;
  const canReply = !busy && text.trim().length > 0 && !overCeiling;

  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canReply) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await api.reply(id, text);
      setReplies((current) => [...current, reply]);
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not reply');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app">
      <header className="topbar">
        <h1><a href="/" className="brand-link">Ember</a></h1>
        <div className="who">
          <a className="handle profile-link" href={`/@${encodeURIComponent(user.handle)}`}>
            @{user.handle}
          </a>
          <button type="button" className="link" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <a className="back-link" href="/">← Home</a>
      {loading && <p className="muted">Loading post…</p>}
      {error && !post && <p className="error">{error}</p>}
      {post && (
        <>
          <section aria-label="Post detail">
            <PostItem post={post} fullText />
          </section>
          <form className="reply-compose" onSubmit={submitReply}>
            <textarea
              placeholder="Write a reply…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
            />
            <div className="compose-actions">
              <span className={`counter${overCeiling ? ' over' : overSoft ? ' soft' : ''}`}>
                {count}{overSoft ? ` / ${SOFT_LIMIT}` : ''}
              </span>
              <button type="submit" disabled={!canReply}>Reply</button>
            </div>
          </form>
          {error && <p className="error">{error}</p>}
          <section aria-label="Replies">
            <h2 className="section-title">Replies</h2>
            {replies.length === 0 && <p className="muted empty">No replies yet.</p>}
            {replies.map((reply) => <PostItem key={reply.id} post={reply} fullText />)}
          </section>
        </>
      )}
    </main>
  );
}
