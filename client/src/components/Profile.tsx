import { useEffect, useState } from 'react';
import { api, ApiError, type Post, type Profile as ProfileData, type User } from '../api';
import { PostItem } from './PostItem';

export function Profile({
  handle,
  user,
  logout,
}: {
  handle: string;
  user: User;
  logout: () => void;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([api.profile(handle), api.profilePosts(handle)])
      .then(([loadedProfile, loadedPosts]) => {
        if (!active) return;
        setProfile(loadedProfile);
        setPosts(loadedPosts.posts);
        setNextCursor(loadedPosts.nextCursor);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : 'could not load profile');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [handle]);

  const toggleFollow = async () => {
    if (!profile || profile.id === user.id) return;
    setFollowBusy(true);
    setError(null);
    try {
      const updated = profile.isFollowing
        ? await api.unfollow(profile.handle)
        : await api.follow(profile.handle);
      setProfile(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not update follow state');
    } finally {
      setFollowBusy(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api.profilePosts(handle, nextCursor);
      setPosts((previous) => [...previous, ...page.posts]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not load more posts');
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <p className="muted">Loading profile…</p>;
  if (error && !profile) return <p className="error">{error}</p>;
  if (!profile) return <p className="error">user not found</p>;

  const ownProfile = profile.id === user.id;

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

      <section className="profile-card" aria-labelledby="profile-name">
        <div className="profile-heading">
          <div>
            <h2 id="profile-name">{profile.displayName}</h2>
            <p className="muted">@{profile.handle}</p>
          </div>
          {!ownProfile && (
            <button type="button" onClick={toggleFollow} disabled={followBusy}>
              {followBusy ? 'Updating…' : profile.isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        <p className="profile-counts">
          <strong>{profile.followerCount}</strong> followers{' '}
          <strong>{profile.followingCount}</strong> following
        </p>
        {error && <p className="error">{error}</p>}
      </section>

      <section aria-label={`${profile.handle}'s posts`}>
        <h3 className="section-title">Posts</h3>
        {posts.length === 0 && <p className="muted empty">No posts yet.</p>}
        {posts.map((post) => <PostItem key={post.id} post={post} />)}
        {nextCursor && (
          <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </main>
  );
}
