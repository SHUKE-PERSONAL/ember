// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api';
import { Settings } from './Settings';

const user = {
  id: 'user-id',
  handle: 'settings-user',
  displayName: 'Settings User',
  email: 'settings-user@example.com',
  bio: null,
  emailVerifiedAt: '2026-08-22T00:00:00.000Z',
  createdAt: '2026-08-22T00:00:00.000Z',
};

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Settings', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  function renderSettings() {
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      root = createRoot(container);
      root.render(<Settings user={user} logout={vi.fn()} />);
    });
    return container;
  }

  it('rejects mismatched confirmation before calling the API', async () => {
    const changePassword = vi.spyOn(api, 'changePassword');
    const container = renderSettings();
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(container.querySelector('#current-password') as HTMLInputElement, 'old-pass');
      setInputValue(container.querySelector('#new-password') as HTMLInputElement, 'new-pass');
      setInputValue(container.querySelector('#confirm-password') as HTMLInputElement, 'different-pass');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(changePassword).not.toHaveBeenCalled();
    expect(container.textContent).toContain('New passwords do not match.');
    container.remove();
  });

  it('shows success and clears the form after changing the password', async () => {
    const changePassword = vi.spyOn(api, 'changePassword').mockResolvedValue(undefined);
    const container = renderSettings();
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(container.querySelector('#current-password') as HTMLInputElement, 'old-pass');
      setInputValue(container.querySelector('#new-password') as HTMLInputElement, 'new-pass');
      setInputValue(container.querySelector('#confirm-password') as HTMLInputElement, 'new-pass');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'old-pass', newPassword: 'new-pass' });
    expect(container.textContent).toContain('Password changed successfully.');
    expect((container.querySelector('#current-password') as HTMLInputElement).value).toBe('');
    expect((container.querySelector('#new-password') as HTMLInputElement).value).toBe('');
    expect((container.querySelector('#confirm-password') as HTMLInputElement).value).toBe('');
    container.remove();
  });

  it('shows a safe API error without leaving the settings page', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(new ApiError(401, 'invalid current password'));
    const container = renderSettings();
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(container.querySelector('#current-password') as HTMLInputElement, 'wrong-pass');
      setInputValue(container.querySelector('#new-password') as HTMLInputElement, 'new-pass');
      setInputValue(container.querySelector('#confirm-password') as HTMLInputElement, 'new-pass');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('invalid current password');
    expect(container.querySelector('form.settings-form')).not.toBeNull();
    container.remove();
  });
});
