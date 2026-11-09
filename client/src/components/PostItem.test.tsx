// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Post, type User } from '../api';
import { AuthProvider } from './AuthGate';
import { PostItem } from './PostItem';

const post: Post = {
  id: 'post-id',
  text: 'hello',
  replyToId: null,
  repostOfId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  author: { id: 'author-id', handle: 'author', displayName: 'Author' },
  likeCount: 1,
  liked: false,
  reposted: false,
  repostOf: null,
};

const user: User = {
  id: 'viewer-id',
  handle: 'viewer',
  displayName: 'Viewer',
  email: 'viewer@example.com',
  bio: null,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('PostItem interactions', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  it('updates like and repost controls from API state', async () => {
    vi.spyOn(api, 'like').mockResolvedValue({ liked: true, likeCount: 2 });
    vi.spyOn(api, 'repost').mockResolvedValue({ reposted: true, post });
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(
        <AuthProvider user={user} showAuth={vi.fn()}>
          <PostItem post={post} />
        </AuthProvider>,
      );
      await Promise.resolve();
    });

    const buttons = container.querySelectorAll('.post-actions button');
    await act(async () => {
      (buttons[0] as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(api.like).toHaveBeenCalledWith('post-id');
    expect(container.textContent).toContain('Unlike · 2');

    await act(async () => {
      (buttons[1] as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(api.repost).toHaveBeenCalledWith('post-id');
    expect(container.textContent).toContain('Unrepost');
    container.remove();
  });

  it('prompts anonymous actions without calling mutating APIs', async () => {
    const showAuth = vi.fn();
    const like = vi.spyOn(api, 'like');
    const repost = vi.spyOn(api, 'repost');
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(
        <AuthProvider user={null} showAuth={showAuth}>
          <PostItem post={post} />
        </AuthProvider>,
      );
      await Promise.resolve();
    });

    const actions = container.querySelectorAll('.post-actions button');
    await act(async () => {
      (actions[0] as HTMLButtonElement).click();
      (actions[1] as HTMLButtonElement).click();
      (actions[2] as HTMLButtonElement).click();
    });

    expect(showAuth).toHaveBeenCalledTimes(3);
    expect(like).not.toHaveBeenCalled();
    expect(repost).not.toHaveBeenCalled();
    container.remove();
  });
});
