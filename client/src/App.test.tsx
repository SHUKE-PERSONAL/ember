// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type Post, type Profile, type User } from './api';
import App from './App';
import { WELCOME_TRANSITION_DELAY_MS } from './components/WelcomeScreen';

const user: User = {
  id: 'user-id',
  handle: 'writer',
  displayName: 'Writer',
  email: 'writer@example.com',
  bio: null,
  emailVerifiedAt: '2026-08-22T00:00:00.000Z',
  createdAt: '2026-08-22T00:00:00.000Z',
};

const publicPost: Post = {
  id: 'public-post',
  text: 'A public post',
  replyToId: null,
  repostOfId: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  author: { id: 'author-id', handle: 'author', displayName: 'Public Author' },
  likeCount: 0,
  liked: false,
  reposted: false,
  repostOf: null,
};

const publicProfile: Profile = {
  id: 'author-id',
  handle: 'author',
  displayName: 'Public Author',
  bio: 'A public profile',
  createdAt: '2026-08-22T00:00:00.000Z',
  followerCount: 0,
  followingCount: 0,
  isFollowing: false,
};

describe('activation route', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('activates the token and shows success', async () => {
    window.history.replaceState({}, '', '/activate?token=valid-token');
    const activate = vi.spyOn(api, 'activate').mockResolvedValue(user);
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
    });

    expect(activate).toHaveBeenCalledWith('valid-token');
    expect(container.textContent).toContain('Email verified');
    expect(container.textContent).toContain('Continue to Ember');
  });

  it('shows activation failure from the API', async () => {
    window.history.replaceState({}, '', '/activate?token=expired-token');
    vi.spyOn(api, 'activate').mockRejectedValue(
      new ApiError(400, 'invalid or expired activation token'),
    );
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Activation failed');
    expect(container.textContent).toContain('invalid or expired activation token');
  });

  it('prompts anonymous visitors for auth on the messages route', async () => {
    window.history.replaceState({}, '', '/messages');
    vi.spyOn(api, 'me').mockRejectedValue(new Error('not authenticated'));
    const messages = vi.spyOn(api, 'messages');
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('form.auth')).not.toBeNull();
    expect(container.textContent).toContain('Log in');
    expect(messages).not.toHaveBeenCalled();
  });

  it('automatically browses anonymously before prompting for a write', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'me').mockRejectedValue(new Error('not authenticated'));
    vi.spyOn(api, 'timeline').mockResolvedValue({ posts: [], nextCursor: null });
    const createPost = vi.spyOn(api, 'createPost');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Uint8Array.of(0x48).buffer,
      }),
    );
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('main.bbs-landing')).not.toBeNull();
    expect(container.querySelector('main.bbs-landing button')).toBeNull();
    expect(container.textContent).not.toContain('Log in or register');
    expect(container.textContent).not.toContain('Browse without an account');
    await act(async () => {
      vi.advanceTimersByTime(WELCOME_TRANSITION_DELAY_MS);
    });

    expect(container.querySelector('main.app')).not.toBeNull();
    expect(container.querySelector('form.auth')).toBeNull();
    expect(container.querySelector('main.app .compose-notice')).toBeNull();
    const login = Array.from(container.querySelectorAll<HTMLButtonElement>('main.app .topbar button'))
      .find((button) => button.textContent === 'Log in');
    expect(login).not.toBeUndefined();
    await act(async () => login?.click());

    expect(container.querySelector('form.auth')).not.toBeNull();
    expect(createPost).not.toHaveBeenCalled();
  });

  it('returns from the auth form to anonymous browsing without reloading', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'me').mockRejectedValue(new Error('not authenticated'));
    vi.spyOn(api, 'timeline').mockResolvedValue({ posts: [], nextCursor: null });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Uint8Array.of(0x48).buffer,
      }),
    );
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(WELCOME_TRANSITION_DELAY_MS);
    });
    const login = Array.from(container.querySelectorAll<HTMLButtonElement>('main.app .topbar button'))
      .find((button) => button.textContent === 'Log in');
    await act(async () => login?.click());
    expect(container.querySelector('form.auth')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(WELCOME_TRANSITION_DELAY_MS + 500));
    expect(container.querySelector('form.auth')).not.toBeNull();

    const browse = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Browse without an account');
    await act(async () => browse?.click());

    expect(container.querySelector('form.auth')).toBeNull();
    expect(container.querySelector('main.app')).not.toBeNull();
  });

  it.each([
    ['post', '/posts/public-post', 'A public post'],
    ['profile', '/@author', 'Public Author'],
    ['topic', '/topic/ember', '#ember'],
    ['search', '/search?q=ember', 'Results for “ember”'],
  ])('renders anonymous %s deep links directly', async (_kind, pathname, expectedText) => {
    window.history.replaceState({}, '', pathname);
    vi.spyOn(api, 'me').mockRejectedValue(new Error('not authenticated'));
    if (pathname.startsWith('/posts/')) {
      vi.spyOn(api, 'postDetail').mockResolvedValue({ post: publicPost, replies: [] });
    } else if (pathname.startsWith('/@')) {
      vi.spyOn(api, 'profile').mockResolvedValue(publicProfile);
      vi.spyOn(api, 'profilePosts').mockResolvedValue({ posts: [], nextCursor: null });
    } else if (pathname.startsWith('/topic/')) {
      vi.spyOn(api, 'topicPosts').mockResolvedValue({ posts: [], nextCursor: null });
    } else {
      vi.spyOn(api, 'search').mockResolvedValue({ posts: [], users: [], nextCursor: null });
    }
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('main.bbs-landing')).toBeNull();
    expect(container.querySelector('form.auth')).toBeNull();
    expect(container.textContent).toContain(expectedText);
  });

  it('shows Settings in the signed-in main navigation and renders the protected route', async () => {
    const me = vi.spyOn(api, 'me').mockResolvedValue(user);
    vi.spyOn(api, 'timeline').mockResolvedValue({ posts: [], nextCursor: null });
    vi.spyOn(api, 'apiKeys').mockResolvedValue({ apiKeys: [] });
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(me).toHaveBeenCalledOnce();
    expect(container.querySelector('a[href="/settings"]')?.textContent).toBe('Settings');

    await act(async () => {
      window.history.replaceState({}, '', '/settings');
      root?.render(<App />);
      await Promise.resolve();
    });
    expect(container.querySelector('form.settings-form')).not.toBeNull();
    expect(container.querySelector('form.auth')).toBeNull();
    container.remove();
  });

  it('sends anonymous visitors on the settings route to auth without showing controls', async () => {
    window.history.replaceState({}, '', '/settings');
    vi.spyOn(api, 'me').mockRejectedValue(new Error('not authenticated'));
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('form.auth')).not.toBeNull();
    expect(container.querySelector('form.settings-form')).toBeNull();
    expect(container.textContent).toContain('Log in');
    container.remove();
  });
});
