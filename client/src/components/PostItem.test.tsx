// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type Post } from '../api';
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
      root.render(<PostItem post={post} />);
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
});
