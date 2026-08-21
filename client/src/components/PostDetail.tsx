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
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null);

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
    setCooldownSeconds(null);
    try {
      const reply = await api.reply(id, text);
      setReplies((current) => [...current, reply]);
      setText('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        const retryAfterSeconds = getRetryAfterSeconds(err.body);
        if (retryAfterSeconds !== null) {
          setCooldownSeconds(retryAfterSeconds);
          return;
        }
      }
      setError(err instanceof ApiError ? err.message : 'could not reply');
    } finally {
      setBusy(false);
    }
  };

  const resendActivation = async () => {
    setResendBusy(true);
    setError(null);
    setResendMessage(null);
    try {
      await api.resendActivation();
      setResendMessage('Activation email sent.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not resend activation email');
    } finally {
      setResendBusy(false);
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
          {!user.emailVerifiedAt ? (
            <section className="reply-compose compose-notice">
              <p>Verify your email before replying.</p>
              {resendMessage && <p className="muted">{resendMessage}</p>}
              <button type="button" onClick={resendActivation} disabled={resendBusy}>
                Resend activation email
              </button>
            </section>
          ) : (
            <form className="reply-compose" onSubmit={submitReply}>
              <textarea
                placeholder="Write a reply…"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={3}
              />
              {cooldownSeconds !== null && (
                <p className="error">Posting cooldown: try again in {cooldownSeconds} seconds.</p>
              )}
              <div className="compose-actions">
                <span className={`counter${overCeiling ? ' over' : overSoft ? ' soft' : ''}`}>
                  {count}{overSoft ? ` / ${SOFT_LIMIT}` : ''}
                </span>
                <button type="submit" disabled={!canReply}>Reply</button>
              </div>
            </form>
          )}
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

function getRetryAfterSeconds(body: unknown) {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
