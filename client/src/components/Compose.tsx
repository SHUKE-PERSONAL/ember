import { useState } from 'react';
import { api, ApiError, type Post } from '../api';
import { graphemeCount, SOFT_LIMIT, MAX_GRAPHEMES } from '../lib/grapheme';

// Compose box with a live grapheme counter. 140 is a soft hint (the counter
// styling changes past it but submit stays enabled); only the 1024 ceiling and
// an empty body disable submission — matching the server (#3).
export function Compose({ onPosted }: { onPosted: (post: Post) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = graphemeCount(text);
  const overSoft = count > SOFT_LIMIT;
  const overCeiling = count > MAX_GRAPHEMES;
  const canSubmit = !busy && text.trim().length > 0 && !overCeiling;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const post = await api.createPost(text);
      setText('');
      onPosted(post);
    } catch (err) {
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
