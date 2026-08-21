import { useRef } from 'react';
import { AuthGate } from './components/AuthGate';
import { Compose } from './components/Compose';
import { Profile } from './components/Profile';
import { Timeline, type TimelineHandle } from './components/Timeline';
import { WelcomeScreen } from './components/WelcomeScreen';
import './styles.css';

export default function App() {
  const timeline = useRef<TimelineHandle>(null);
  const profileHandle = getProfileHandle(window.location.pathname);

  return (
    <AuthGate unauthenticated={(showAuth) => <WelcomeScreen onEnter={showAuth} />}>
      {(user, logout) => (
        profileHandle ? (
          <Profile handle={profileHandle} user={user} logout={logout} />
        ) : (
          <main className="app">
            <header className="topbar">
              <h1>Ember</h1>
              <div className="who">
                <a className="handle profile-link" href={`/@${encodeURIComponent(user.handle)}`}>
                  @{user.handle}
                </a>
                <button type="button" className="link" onClick={logout}>
                  Log out
                </button>
              </div>
            </header>
            <Compose onPosted={(post) => timeline.current?.prepend(post)} />
            <Timeline ref={timeline} />
          </main>
        )
      )}
    </AuthGate>
  );
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
