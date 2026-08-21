import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type User } from '../api';

// Minimal session gate. Resolves the current user via /api/me; when absent it
// renders the combined login / register form by default. Callers may put a
// public screen in front of that form. The richer profile UI is #4 — this
// exists only so #3 has a "current user".
export function AuthGate({
  children,
  unauthenticated,
}: {
  children: (user: User, logout: () => void) => ReactNode;
  unauthenticated?: (showAuth: () => void) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading…</p>;
  if (!user) {
    if (showAuth || !unauthenticated) return <AuthForm onAuthed={setUser} />;
    return unauthenticated(() => setShowAuth(true));
  }

  const logout = () => {
    api.logout().finally(() => {
      setUser(null);
      setShowAuth(false);
    });
  };
  return <>{children(user, logout)}</>;
}

function AuthForm({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ handle, email, password });
      onAuthed(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth" onSubmit={submit}>
      <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
      {mode === 'register' && (
        <input
          placeholder="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="username"
        />
      )}
      <input
        placeholder="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <input
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {mode === 'login' ? 'Log in' : 'Sign up'}
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
        }}
      >
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
      </button>
    </form>
  );
}
