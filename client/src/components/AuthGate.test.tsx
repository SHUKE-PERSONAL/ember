// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { AuthForm, AuthGate } from './AuthGate';

const user = {
  id: 'user-id',
  handle: 'login-user',
  displayName: 'Login User',
  email: 'login-user@example.com',
  bio: null,
  emailVerifiedAt: '2026-08-22T00:00:00.000Z',
  createdAt: '2026-08-22T00:00:00.000Z',
};

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('AuthForm', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  it('submits an email-or-handle identifier when logging in', async () => {
    const login = vi.spyOn(api, 'login').mockResolvedValue(user);
    const onAuthed = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<AuthForm onAuthed={onAuthed} />);
    });

    const identifier = container.querySelector<HTMLInputElement>('input[placeholder="email or handle"]');
    const password = container.querySelector<HTMLInputElement>('input[type="password"]');
    const form = container.querySelector('form');
    expect(identifier?.type).toBe('text');
    expect(identifier).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      setInputValue(identifier as HTMLInputElement, 'login-user');
      setInputValue(password as HTMLInputElement, 'correct-horse');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(login).toHaveBeenCalledWith({ identifier: 'login-user', password: 'correct-horse' });
    expect(onAuthed).toHaveBeenCalledWith(user);
    container.remove();
  });

  it('keeps registration handle and email inputs separate', async () => {
    const register = vi.spyOn(api, 'register').mockResolvedValue(user);
    const onAuthed = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<AuthForm onAuthed={onAuthed} />);
    });

    const toggle = container.querySelector<HTMLButtonElement>('button.link');
    await act(async () => {
      toggle?.click();
    });

    const handle = container.querySelector<HTMLInputElement>('input[placeholder="handle"]');
    const email = container.querySelector<HTMLInputElement>('input[placeholder="email"]');
    const password = container.querySelector<HTMLInputElement>('input[type="password"]');
    const form = container.querySelector('form');
    expect(handle).not.toBeNull();
    expect(email?.type).toBe('email');

    await act(async () => {
      setInputValue(handle as HTMLInputElement, 'login-user');
      setInputValue(email as HTMLInputElement, 'login-user@example.com');
      setInputValue(password as HTMLInputElement, 'correct-horse');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(register).toHaveBeenCalledWith({
      handle: 'login-user',
      email: 'login-user@example.com',
      password: 'correct-horse',
    });
    container.remove();
  });

  it('allows an unverified logged-in session to browse the app', async () => {
    const unverified = { ...user, emailVerifiedAt: null };
    vi.spyOn(api, 'me').mockResolvedValue(unverified);
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<AuthGate>{() => <p>app</p>}</AuthGate>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('app');
    expect(container.textContent).not.toContain('Check your email');
    container.remove();
  });

  it('holds a newly registered unverified session on the check-email screen', async () => {
    vi.spyOn(api, 'me').mockRejectedValue(new Error('not authenticated'));
    const registered = { ...user, emailVerifiedAt: null };
    const register = vi.spyOn(api, 'register').mockResolvedValue(registered);
    const resend = vi.spyOn(api, 'resendActivation').mockResolvedValue(registered);
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(
        <AuthGate unauthenticated={(showAuth) => <button onClick={showAuth}>enter</button>}>
          {() => <p>app</p>}
        </AuthGate>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button.link')?.click();
    });
    const handle = container.querySelector<HTMLInputElement>('input[placeholder="handle"]');
    const email = container.querySelector<HTMLInputElement>('input[placeholder="email"]');
    const password = container.querySelector<HTMLInputElement>('input[type="password"]');
    const form = container.querySelector('form');
    await act(async () => {
      setInputValue(handle as HTMLInputElement, 'login-user');
      setInputValue(email as HTMLInputElement, 'login-user@example.com');
      setInputValue(password as HTMLInputElement, 'correct-horse');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(register).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Check your email');
    expect(container.textContent).not.toContain('app');
    const button = Array.from(container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent === 'Resend activation email');
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(resend).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Activation email sent.');
    container.remove();
  });
});
