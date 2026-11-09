// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type User } from './api';
import App from './App';

const user: User = {
  id: 'user-id',
  handle: 'writer',
  displayName: 'Writer',
  email: 'writer@example.com',
  bio: null,
  emailVerifiedAt: '2026-08-22T00:00:00.000Z',
  createdAt: '2026-08-22T00:00:00.000Z',
};

describe('activation route', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    window.history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
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

  it('prompts anonymous visitors before posting from home', async () => {
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

    const browse = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Browse without an account');
    expect(browse).not.toBeUndefined();
    await act(async () => {
      browse?.click();
      await Promise.resolve();
    });

    const loginToPost = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Log in or register');
    expect(loginToPost).not.toBeUndefined();
    await act(async () => loginToPost?.click());

    expect(container.querySelector('form.auth')).not.toBeNull();
    expect(createPost).not.toHaveBeenCalled();
  });
});
