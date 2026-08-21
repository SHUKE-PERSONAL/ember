// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type Post, type User } from '../api';
import { PostDetail } from './PostDetail';

const post: Post = {
  id: 'post-id',
  text: 'hello',
  replyToId: null,
  repostOfId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  author: { id: 'author-id', handle: 'author', displayName: 'Author' },
  likeCount: 0,
  liked: false,
  reposted: false,
  repostOf: null,
};

const verifiedUser: User = {
  id: 'viewer-id',
  handle: 'viewer',
  displayName: 'Viewer',
  email: 'viewer@example.com',
  bio: null,
  emailVerifiedAt: '2026-08-22T00:00:00.000Z',
  createdAt: '2026-08-22T00:00:00.000Z',
};

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('PostDetail posting notices', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  it('shows an activation notice and resend control for unverified replies', async () => {
    vi.spyOn(api, 'postDetail').mockResolvedValue({ post, replies: [] });
    const resend = vi.spyOn(api, 'resendActivation').mockResolvedValue({
      ...verifiedUser,
      emailVerifiedAt: null,
    });
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<PostDetail id="post-id" user={{ ...verifiedUser, emailVerifiedAt: null }} logout={vi.fn()} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Verify your email before replying.');
    await act(async () => {
      container.querySelector('.reply-compose button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(resend).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Activation email sent.');
  });

  it('shows the server-provided cooldown for replies', async () => {
    vi.spyOn(api, 'postDetail').mockResolvedValue({ post, replies: [] });
    vi.spyOn(api, 'reply').mockRejectedValue(
      new ApiError(403, 'posting cooldown', {
        error: 'posting cooldown',
        retryAfterSeconds: 42,
      }),
    );
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<PostDetail id="post-id" user={verifiedUser} logout={vi.fn()} />);
      await Promise.resolve();
    });
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const form = container.querySelector('.reply-compose form') ?? container.querySelector('form.reply-compose');
    await act(async () => {
      setTextareaValue(textarea, 'a reply');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('try again in 42 seconds');
  });
});
