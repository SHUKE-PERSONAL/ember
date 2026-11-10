import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type User } from './api';
import { AuthGate, useAuth } from './components/AuthGate';
import { Compose } from './components/Compose';
import { Profile } from './components/Profile';
import { PostDetail } from './components/PostDetail';
import { Timeline, type TimelineHandle } from './components/Timeline';
import { Search } from './components/Search';
import { Topic } from './components/Topic';
import { Messages } from './components/Messages';
import { Settings } from './components/Settings';
import { WelcomeScreen } from './components/WelcomeScreen';
import './styles.css';

export default function App() {
  const activationToken = getActivationToken(window.location);
  if (activationToken !== null) return <ActivationPage token={activationToken} />;
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { pathname } = window.location;
  const messageRoute = getMessageHandle(pathname);
  const settingsRoute = isSettingsPath(pathname);
  const rootLanding = /^\/?$/.test(pathname);

  return (
    <AuthGate
      unauthenticated={(showAuth, browse) => {
        if (settingsRoute) {
          return <AuthPromptRedirect onRedirect={showAuth} message="Log in to use Settings…" />;
        }
        if (messageRoute !== undefined) {
          return <AuthPromptRedirect onRedirect={showAuth} message="Log in to use Messages…" />;
        }
        if (rootLanding) return <WelcomeScreen onBrowse={browse} />;
        // Public post, profile, topic, and search routes enter AppShell directly.
        return <AuthPromptRedirect onRedirect={browse} message="Loading…" />;
      }}
    >
      {(user, logout) => <AppShell user={user} logout={logout} />}
    </AuthGate>
  );
}

function AuthPromptRedirect({
  onRedirect,
  message,
}: {
  onRedirect: () => void;
  message: string;
}) {
  useEffect(() => {
    onRedirect();
  }, [onRedirect]);
  return <p className="muted">{message}</p>;
}

function AppShell({ user, logout }: { user: User | null; logout: () => void }) {
  const timeline = useRef<TimelineHandle>(null);
  const { showAuth } = useAuth();
  const profileHandle = getProfileHandle(window.location.pathname);
  const postId = getPostId(window.location.pathname);
  const topicTag = getTopicTag(window.location.pathname);
  const searchQuery = getSearchQuery(window.location);
  const messageHandle = getMessageHandle(window.location.pathname);
  const settingsRoute = isSettingsPath(window.location.pathname);

  if (messageHandle !== undefined && !user) {
    return <AuthPromptRedirect onRedirect={showAuth} message="Log in to use Messages…" />;
  }
  if (settingsRoute) {
    if (!user) return <AuthPromptRedirect onRedirect={showAuth} message="Log in to use Settings…" />;
    return <Settings user={user} logout={logout} />;
  }
  if (profileHandle) return <Profile handle={profileHandle} user={user} logout={logout} />;
  if (postId) return <PostDetail id={postId} user={user} logout={logout} />;
  if (topicTag) return <Topic tag={topicTag} user={user} logout={logout} />;
  if (searchQuery !== null) return <Search query={searchQuery} user={user} logout={logout} />;
  if (messageHandle !== undefined) {
    return <Messages handle={messageHandle} user={user!} logout={logout} />;
  }

  return (
    <main className="app">
      <header className="topbar">
        <h1>Ember</h1>
        <div className="who">
          <a href="/search">Search</a>
          <a href="/messages">Messages</a>
          {user ? (
            <>
              <a href="/settings">Settings</a>
              <a className="handle profile-link" href={`/@${encodeURIComponent(user.handle)}`}>
                @{user.handle}
              </a>
              <button type="button" className="link" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button type="button" className="link" onClick={showAuth}>
              Log in
            </button>
          )}
        </div>
      </header>
      {user && <Compose user={user} onPosted={(post) => timeline.current?.prepend(post)} />}
      <Timeline ref={timeline} />
    </main>
  );
}

function ActivationPage({ token }: { token: string }) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [continueToApp, setContinueToApp] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.activate(token)
      .then(() => {
        if (mounted) setStatus('success');
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof ApiError ? err.message : 'could not activate your email');
        setStatus('error');
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  if (continueToApp) return <AuthenticatedApp />;
  return (
    <main className="auth">
      {status === 'loading' && <p>Activating your email…</p>}
      {status === 'success' && (
        <>
          <h2>Email verified</h2>
          <p>Your Ember account is ready.</p>
          <button
            type="button"
            onClick={() => {
              window.history.replaceState({}, '', '/');
              setContinueToApp(true);
            }}
          >
            Continue to Ember
          </button>
        </>
      )}
      {status === 'error' && (
        <>
          <h2>Activation failed</h2>
          <p className="error">{error}</p>
        </>
      )}
    </main>
  );
}

function getActivationToken(location: Location) {
  if (!/^\/activate\/?$/.test(location.pathname)) return null;
  return new URLSearchParams(location.search).get('token') ?? '';
}

function getPostId(pathname: string) {
  const match = pathname.match(/^\/posts\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function getProfileHandle(pathname: string) {
  const match = pathname.match(/^\/@([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function getTopicTag(pathname: string) {
  const match = pathname.match(/^\/topic\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function getSearchQuery(location: Location) {
  if (!/^\/search\/?$/.test(location.pathname)) return null;
  return new URLSearchParams(location.search).get('q') ?? '';
}

function getMessageHandle(pathname: string): string | null | undefined {
  const match = pathname.match(/^\/messages(?:\/([^/]+))?\/?$/);
  if (!match) return undefined;
  if (!match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function isSettingsPath(pathname: string) {
  return /^\/settings\/?$/.test(pathname);
}
