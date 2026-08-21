import { useState } from 'react';
import { api, ApiError, type Post, type User } from '../api';
import { graphemeCount, SOFT_LIMIT, MAX_GRAPHEMES } from '../lib/grapheme';

// Compose box with a live grapheme counter. 140 is a soft hint (the counter
// styling changes past it but submit stays enabled); verified users are still
// subject to the server's 1024 ceiling and activation/cooldown checks.
export function Compose({ user, onPosted }: { user: User; onPosted: (post: Post) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number | null>(null);

  const count = graphemeCount(text);
  const overSoft = count > SOFT_LIMIT;
  const overCeiling = count > MAX_GRAPHEMES;
  const canSubmit = !busy && text.trim().length > 0 && !overCeiling;

  const resend = async () => {
    setResendBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.resendActivation();
      setMessage('Activation email sent.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not resend activation email');
    } finally {
      setResendBusy(false);
    }
  };

  if (!user.emailVerifiedAt) {
    return (
      <section className="compose compose-notice">
        <p>Verify your email before posting.</p>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
        <button type="button" onClick={resend} disabled={resendBusy}>
          Resend activation email
        </button>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setCooldownSeconds(null);
    try {
      const post = await api.createPost(text);
      setText('');
      onPosted(post);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        const retryAfterSeconds = getRetryAfterSeconds(err.body);
        if (retryAfterSeconds !== null) {
          setCooldownSeconds(retryAfterSeconds);
          return;
        }
      }
      setError(err instanceof ApiError ? err.message : 'could not post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="compose" onSubmit={submit}>
      <textarea
        placeholder="What's happening?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
      />
      {error && <p className="error">{error}</p>}
      {cooldownSeconds !== null && (
        <p className="error">Posting cooldown: try again in {cooldownSeconds} seconds.</p>
      )}
      <div className="compose-actions">
        <span className={`counter${overCeiling ? ' over' : overSoft ? ' soft' : ''}`}>
          {count}
          {overSoft ? ` / ${SOFT_LIMIT}` : ''}
        </span>
        <button type="submit" disabled={!canSubmit}>
          Post
        </button>
      </div>
    </form>
  );
}

function getRetryAfterSeconds(body: unknown) {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
