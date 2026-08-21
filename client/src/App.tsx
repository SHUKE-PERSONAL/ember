import { useRef } from 'react';
import { AuthGate } from './components/AuthGate';
import { Compose } from './components/Compose';
import { Profile } from './components/Profile';
import { PostDetail } from './components/PostDetail';
import { Timeline, type TimelineHandle } from './components/Timeline';
import { Search } from './components/Search';
import { Topic } from './components/Topic';
import { WelcomeScreen } from './components/WelcomeScreen';
import './styles.css';

export default function App() {
  const timeline = useRef<TimelineHandle>(null);
  const profileHandle = getProfileHandle(window.location.pathname);
  const postId = getPostId(window.location.pathname);
  const topicTag = getTopicTag(window.location.pathname);
  const searchQuery = getSearchQuery(window.location);

  return (
    <AuthGate unauthenticated={(showAuth) => <WelcomeScreen onEnter={showAuth} />}>
      {(user, logout) => (
        profileHandle ? (
          <Profile handle={profileHandle} user={user} logout={logout} />
        ) : postId ? (
          <PostDetail id={postId} user={user} logout={logout} />
        ) : topicTag ? (
          <Topic tag={topicTag} user={user} logout={logout} />
        ) : searchQuery !== null ? (
          <Search query={searchQuery} user={user} logout={logout} />
        ) : (
          <main className="app">
            <header className="topbar">
              <h1>Ember</h1>
              <div className="who">
                <a href="/search">Search</a>
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
