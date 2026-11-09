import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type User } from '../api';

interface AuthContextValue {
  user: User | null;
  showAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  showAuth,
  children,
}: AuthContextValue & { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user, showAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthGate');
  return context;
}

// Resolves the current user via /api/me, keeps the existing auth form and
// activation flow, and lets callers choose between auth and public browsing.
export function AuthGate({
  children,
  unauthenticated,
}: {
  children: (user: User | null, logout: () => void) => ReactNode;
  unauthenticated?: (showAuth: () => void, browse: () => void) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [activationPending, setActivationPending] = useState(false);

  const openAuth = useCallback(() => setShowAuth(true), []);
  const browse = useCallback(() => {
    setShowAuth(false);
    setBrowsing(true);
  }, []);

  useEffect(() => {
    api.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    api.logout().finally(() => {
      setUser(null);
      setShowAuth(false);
      setBrowsing(false);
      setActivationPending(false);
    });
  }, []);

  if (loading) return <p className="muted">Loading…</p>;

  const authForm = (
    <AuthForm
      onAuthed={(authenticated) => {
        setActivationPending(false);
        setUser(authenticated);
      }}
      onRegistered={(registered) => {
        setActivationPending(!registered.emailVerifiedAt);
        setUser(registered);
      }}
    />
  );

  if (!user && showAuth) {
    return authForm;
  }
  if (!user && !browsing && unauthenticated) return unauthenticated(openAuth, browse);
  if (!user && !browsing) return authForm;
  if (user && activationPending && !user.emailVerifiedAt) {
    return <ActivationPending user={user} logout={logout} />;
  }
  return (
    <AuthProvider user={user} showAuth={openAuth}>
      {children(user, logout)}
    </AuthProvider>
  );
}

function ActivationPending({ user, logout }: { user: User; logout: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await api.resendActivation();
      setMessage('Activation email sent.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not resend activation email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <h2>Check your email</h2>
      <p>We sent an activation link to {user.email}.</p>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={resend} disabled={busy}>
        Resend activation email
      </button>
      <button type="button" className="link" onClick={logout}>
        Log out
      </button>
    </main>
  );
}

export function AuthForm({
  onAuthed,
  onRegistered,
}: {
  onAuthed: (u: User) => void;
  onRegistered?: (u: User) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [handle, setHandle] = useState('');
  const [identifier, setIdentifier] = useState('');
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
          ? await api.login({ identifier, password })
          : await api.register({ handle, email, password });
      if (mode === 'register' && onRegistered) onRegistered(user);
      else onAuthed(user);
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
        placeholder={mode === 'login' ? 'email or handle' : 'email'}
        type={mode === 'login' ? 'text' : 'email'}
        value={mode === 'login' ? identifier : email}
        onChange={(e) =>
          mode === 'login' ? setIdentifier(e.target.value) : setEmail(e.target.value)
        }
        autoComplete={mode === 'login' ? 'username' : 'email'}
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
