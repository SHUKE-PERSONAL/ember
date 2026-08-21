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
});
