// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type User } from '../api';
import { Compose } from './Compose';

const user: User = {
  id: 'user-id',
  handle: 'writer',
  displayName: 'Writer',
  email: 'writer@example.com',
  bio: null,
  emailVerifiedAt: '2026-08-22T00:00:00.000Z',
  createdAt: '2026-08-22T00:00:00.000Z',
};

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Compose', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  it('shows the server-provided posting cooldown remaining time', async () => {
    vi.spyOn(api, 'createPost').mockRejectedValue(
      new ApiError(403, 'posting cooldown', {
        error: 'posting cooldown',
        retryAfterSeconds: 42,
      }),
    );
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<Compose user={user} onPosted={vi.fn()} />);
    });
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const form = container.querySelector('form');
    await act(async () => {
      setTextareaValue(textarea, 'a post');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('try again in 42 seconds');
  });

  it('shows an activation notice and can resend for an unverified user', async () => {
    const resend = vi.spyOn(api, 'resendActivation').mockResolvedValue({
      ...user,
      emailVerifiedAt: null,
    });
    const container = document.createElement('div');

    await act(async () => {
      root = createRoot(container);
      root.render(<Compose user={{ ...user, emailVerifiedAt: null }} onPosted={vi.fn()} />);
    });
    expect(container.textContent).toContain('Verify your email before posting.');

    await act(async () => {
      container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(resend).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Activation email sent.');
  });
});
