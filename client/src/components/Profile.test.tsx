// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Profile as ProfileData, type User } from '../api';
import { Profile } from './Profile';

const user: User = {
  id: 'viewer-id',
  handle: 'viewer',
  displayName: 'Viewer',
  email: 'viewer@example.com',
  bio: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const profile: ProfileData = {
  id: 'author-id',
  handle: 'author',
  displayName: 'Author',
  bio: 'A profile bio',
  createdAt: '2026-01-01T00:00:00.000Z',
  followerCount: 0,
  followingCount: 2,
  isFollowing: false,
};

describe('Profile', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  it('renders profile details and updates follow state and count', async () => {
    vi.spyOn(api, 'profile').mockResolvedValue(profile);
    vi.spyOn(api, 'profilePosts').mockResolvedValue({
      posts: [],
      nextCursor: null,
    });
    vi.spyOn(api, 'follow').mockResolvedValue({
      ...profile,
      followerCount: 1,
      isFollowing: true,
    });
    const logout = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<Profile handle="author" user={user} logout={logout} />);
      await Promise.resolve();
    });

    expect(container.querySelector('#profile-name')?.textContent).toBe('Author');
    expect(container.textContent).toContain('@author');
    expect(container.textContent).toContain('0 followers');
    expect(container.querySelector('a[href="/@viewer"]')).not.toBeNull();

    const followButton = container.querySelector('button:not(.link)') as HTMLButtonElement;
    expect(followButton.textContent).toBe('Follow');
    await act(async () => {
      followButton.click();
      await Promise.resolve();
    });

    expect(api.follow).toHaveBeenCalledWith('author');
    expect(followButton.textContent).toBe('Following');
    expect(container.textContent).toContain('1 followers');
    container.remove();
  });

  it('hides follow controls on the signed-in user profile', async () => {
    const ownProfile = { ...profile, id: user.id, handle: user.handle };
    vi.spyOn(api, 'profile').mockResolvedValue(ownProfile);
    vi.spyOn(api, 'profilePosts').mockResolvedValue({ posts: [], nextCursor: null });
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<Profile handle={user.handle} user={user} logout={vi.fn()} />);
      await Promise.resolve();
    });

    expect(container.querySelector('button:not(.link)')).toBeNull();
    container.remove();
  });
});
