import { useRef } from 'react';
import { AuthGate } from './components/AuthGate';
import { Compose } from './components/Compose';
import { Timeline, type TimelineHandle } from './components/Timeline';
import './styles.css';

export default function App() {
  const timeline = useRef<TimelineHandle>(null);

  return (
    <AuthGate>
      {(user, logout) => (
        <main className="app">
          <header className="topbar">
            <h1>Ember</h1>
            <div className="who">
              <span className="handle">@{user.handle}</span>
              <button type="button" className="link" onClick={logout}>
                Log out
              </button>
            </div>
          </header>
          <Compose onPosted={(post) => timeline.current?.prepend(post)} />
          <Timeline ref={timeline} />
        </main>
      )}
    </AuthGate>
  );
}
