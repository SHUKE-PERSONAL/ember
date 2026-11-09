// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomeScreen, WELCOME_TRANSITION_DELAY_MS } from './WelcomeScreen';

const welcomeBytes = Uint8Array.from([
  0x1b,
  0x5b,
  0x31,
  0x3b,
  0x33,
  0x32,
  0x6d,
  0xc9,
  0xcd,
  0xbb,
  0x1b,
  0x5b,
  0x30,
  0x6d,
  0x0d,
  0x0a,
  0x1b,
  0x5b,
  0x30,
  0x3b,
  0x34,
  0x34,
  0x6d,
  0xba,
  0x20,
  0x48,
  0x69,
  0x2c,
  0x20,
  0xbb,
  0xb6,
  0xd3,
  0xad,
  0xb9,
  0xe2,
  0xc1,
  0xd9,
  0xca,
  0xe6,
  0xbf,
  0xcb,
  0x42,
  0x42,
  0x53,
  0xd2,
  0xbb,
  0xcf,
  0xdf,
  0x2e,
  0x2e,
  0x2e,
  0x2e,
  0x2e,
  0x2e,
  0x20,
  0x20,
  0x1b,
  0x5b,
  0x31,
  0x3b,
  0x33,
  0x32,
  0x6d,
  0xba,
  0x20,
  0x1b,
  0x5b,
  0x30,
  0x6d,
  0x0d,
  0x0a,
  0x1b,
  0x5b,
  0x31,
  0x3b,
  0x33,
  0x32,
  0x6d,
  0xc8,
  0xcd,
  0xbc,
  0x1b,
  0x5b,
  0x30,
  0x6d,
]);

describe('WelcomeScreen', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders the ANSI greeting in a table without box-drawing text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => welcomeBytes.buffer,
      }),
    );
    const onBrowse = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<WelcomeScreen onBrowse={onBrowse} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const table = container.querySelector('table.bbs-screen');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('tbody > tr')).toHaveLength(3);
    expect(Array.from(table?.querySelectorAll('tbody > tr') ?? []).map((row) => row.children.length))
      .toEqual([3, 27, 3]);
    expect(table?.textContent?.trim()).toBe('Hi, 欢迎光临舒克BBS一线......');
    expect(table?.querySelector('td.ansi-bold.ansi-fg-2')).not.toBeNull();
    expect(table?.querySelector('td.ansi-bg-4')).not.toBeNull();
    expect(container.querySelector('pre')).toBeNull();
    expect(table?.textContent).not.toMatch(/[╔═╗║╚╝]/u);

    container.remove();
  });

  it('auto-advances after the ANSI screen loads', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Uint8Array.of(0x48).buffer,
      }),
    );
    const onBrowse = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<WelcomeScreen onBrowse={onBrowse} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('.bbs-screen')).not.toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).not.toContain('Log in or register');
    expect(container.textContent).not.toContain('Browse without an account');
    expect(onBrowse).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(WELCOME_TRANSITION_DELAY_MS - 1);
    });
    expect(onBrowse).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(onBrowse).toHaveBeenCalledOnce();
    container.remove();
  });

  it('does not auto-advance when the ANSI screen fails to load', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const onBrowse = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<WelcomeScreen onBrowse={onBrowse} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Welcome screen unavailable.');

    await act(async () => {
      vi.advanceTimersByTime(WELCOME_TRANSITION_DELAY_MS);
    });
    expect(onBrowse).not.toHaveBeenCalled();
    container.remove();
  });
});
