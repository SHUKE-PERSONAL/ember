// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type User } from '../api';
import { Search } from './Search';
import { Topic } from './Topic';

const user: User = {
  id: 'viewer-id',
  handle: 'viewer',
  displayName: 'Viewer',
  email: 'viewer@example.com',
  bio: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('topic and search views', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  it('shows an empty topic state', async () => {
    vi.spyOn(api, 'topicPosts').mockResolvedValue({ posts: [], nextCursor: null });
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<Topic tag="ember" user={user} logout={vi.fn()} />);
      await Promise.resolve();
    });

    expect(api.topicPosts).toHaveBeenCalledWith('ember');
    expect(container.textContent).toContain('No posts found for #ember.');
  });

  it('shows an empty search state', async () => {
    vi.spyOn(api, 'search').mockResolvedValue({
      posts: [],
      users: [],
      nextCursor: null,
    });
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<Search query="missing" user={user} logout={vi.fn()} />);
      await Promise.resolve();
    });

    expect(api.search).toHaveBeenCalledWith('missing');
    expect(container.textContent).toContain('No results found.');
  });
});
