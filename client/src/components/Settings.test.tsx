// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, type ApiKeyList } from '../api';
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
    vi.unstubAllGlobals();
  });

  function renderSettings(apiKeys: Promise<ApiKeyList> = Promise.resolve({ apiKeys: [] })) {
    const container = document.createElement('div');
    document.body.append(container);
    vi.spyOn(api, 'apiKeys').mockReturnValue(apiKeys);
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

  it('renders the current email and rejects mismatched email confirmation locally', async () => {
    const changeEmail = vi.spyOn(api, 'changeEmail');
    const container = renderSettings();
    const form = container.querySelector('form.email-change-form');

    expect(container.textContent).toContain('settings-user@example.com');
    await act(async () => {
      setInputValue(container.querySelector('#email-current-password') as HTMLInputElement, 'old-pass');
      setInputValue(container.querySelector('#new-email') as HTMLInputElement, 'new@example.com');
      setInputValue(container.querySelector('#confirm-email') as HTMLInputElement, 'different@example.com');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(changeEmail).not.toHaveBeenCalled();
    expect(container.textContent).toContain('New email addresses do not match.');
    container.remove();
  });

  it('shows a pending email-change success and clears its form', async () => {
    const changeEmail = vi.spyOn(api, 'changeEmail').mockResolvedValue({ status: 'pending' });
    const container = renderSettings();
    const form = container.querySelector('form.email-change-form');

    await act(async () => {
      setInputValue(container.querySelector('#email-current-password') as HTMLInputElement, 'old-pass');
      setInputValue(container.querySelector('#new-email') as HTMLInputElement, 'new@example.com');
      setInputValue(container.querySelector('#confirm-email') as HTMLInputElement, 'new@example.com');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(changeEmail).toHaveBeenCalledWith({
      currentPassword: 'old-pass',
      newEmail: 'new@example.com',
    });
    expect(container.textContent).toContain('Email change pending. Check new@example.com');
    expect((container.querySelector('#email-current-password') as HTMLInputElement).value).toBe('');
    expect((container.querySelector('#new-email') as HTMLInputElement).value).toBe('');
    expect((container.querySelector('#confirm-email') as HTMLInputElement).value).toBe('');
    container.remove();
  });

  it('shows a safe email-change API error', async () => {
    vi.spyOn(api, 'changeEmail').mockRejectedValue(
      new ApiError(503, 'activation email unavailable'),
    );
    const container = renderSettings();
    const form = container.querySelector('form.email-change-form');

    await act(async () => {
      setInputValue(container.querySelector('#email-current-password') as HTMLInputElement, 'old-pass');
      setInputValue(container.querySelector('#new-email') as HTMLInputElement, 'new@example.com');
      setInputValue(container.querySelector('#confirm-email') as HTMLInputElement, 'new@example.com');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('activation email unavailable');
    expect(container.querySelector('form.email-change-form')).not.toBeNull();
    container.remove();
  });

  it('loads and renders only masked API-key metadata', async () => {
    const apiKeys = Promise.resolve({
      apiKeys: [{
        id: 'key-id',
        name: 'HappyNotes sync',
        scopes: 'posts:write',
        expiresAt: '2027-01-01T00:00:00.000Z',
        lastUsedAt: null,
        createdAt: '2026-08-22T00:00:00.000Z',
      }],
    });
    const container = renderSettings(apiKeys);
    expect(container.textContent).toContain('Loading API keys…');

    await act(async () => {
      await apiKeys;
    });

    expect(container.textContent).toContain('HappyNotes sync');
    expect(container.textContent).toContain('posts:write');
    expect(container.querySelector('.api-key-list')).not.toBeNull();
    container.remove();
  });

  it('rejects an empty API-key name before calling the API', async () => {
    const createApiKey = vi.spyOn(api, 'createApiKey');
    const container = renderSettings();

    await act(async () => {
      container.querySelector('form.api-key-form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });

    expect(createApiKey).not.toHaveBeenCalled();
    expect(container.textContent).toContain('API key name is required.');
    container.remove();
  });

  it('shows and then dismisses the plaintext key without adding it to the list', async () => {
    const createApiKey = vi.spyOn(api, 'createApiKey').mockResolvedValue({
      id: 'created-key',
      name: 'Agent sync',
      scopes: 'posts:write',
      expiresAt: null,
      lastUsedAt: null,
      createdAt: '2026-08-22T00:00:00.000Z',
      key: 'emb_one-time-secret',
    });
    const container = renderSettings();

    await act(async () => {
      setInputValue(container.querySelector('#api-key-name') as HTMLInputElement, 'Agent sync');
      setInputValue(container.querySelector('#api-key-scopes') as HTMLInputElement, 'posts:write');
      setInputValue(container.querySelector('#api-key-expires-at') as HTMLInputElement, '2027-01-01T12:00');
      container.querySelector('form.api-key-form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(createApiKey).toHaveBeenCalledWith({
      name: 'Agent sync',
      scopes: 'posts:write',
      expiresAt: '2027-01-01T12:00',
    });
    expect((container.querySelector('.api-key-secret-value') as HTMLInputElement).value)
      .toBe('emb_one-time-secret');
    expect(container.textContent).toContain('API key created. Copy the secret now; it will not be shown again.');
    expect(container.querySelector('.api-key-list')?.textContent).not.toContain('emb_one-time-secret');

    const dismiss = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Dismiss secret'));
    act(() => dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('.api-key-secret-value')).toBeNull();
    expect(container.textContent).not.toContain('emb_one-time-secret');
    container.remove();
  });

  it('confirms and removes a listed key after successful revocation', async () => {
    const listed = Promise.resolve({
      apiKeys: [{
        id: 'key-id',
        name: 'Agent sync',
        scopes: '',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-08-22T00:00:00.000Z',
      }],
    });
    const revokeApiKey = vi.spyOn(api, 'revokeApiKey').mockResolvedValue(undefined);
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);
    const container = renderSettings(listed);

    await act(async () => {
      await listed;
    });
    const revoke = container.querySelector('button.api-key-revoke');
    await act(async () => {
      revoke?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirm).toHaveBeenCalledWith('Revoke the API key “Agent sync”?');
    expect(revokeApiKey).toHaveBeenCalledWith('key-id');
    expect(container.querySelector('.api-key-list')).toBeNull();
    expect(container.textContent).toContain('No API keys yet.');
    container.remove();
  });

  it('keeps the listed key and shows a safe error when revocation fails', async () => {
    const listed = Promise.resolve({
      apiKeys: [{
        id: 'key-id',
        name: 'Agent sync',
        scopes: '',
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-08-22T00:00:00.000Z',
      }],
    });
    vi.spyOn(api, 'revokeApiKey').mockRejectedValue(new ApiError(404, 'API key not found'));
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);
    const container = renderSettings(listed);

    await act(async () => {
      await listed;
    });
    await act(async () => {
      container.querySelector('button.api-key-revoke')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('.api-key-list')).not.toBeNull();
    expect(container.textContent).toContain('API key not found');
    container.remove();
  });
});
