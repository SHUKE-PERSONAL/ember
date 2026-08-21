// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomeScreen, WELCOME_TRANSITION_DELAY_MS } from './WelcomeScreen';

describe('WelcomeScreen', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
    const onEnter = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<WelcomeScreen onEnter={onEnter} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('.bbs-screen')).not.toBeNull();
    expect(onEnter).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(WELCOME_TRANSITION_DELAY_MS - 1);
    });
    expect(onEnter).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(onEnter).toHaveBeenCalledOnce();
    container.remove();
  });

  it('does not auto-advance when the ANSI screen fails to load', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    const onEnter = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<WelcomeScreen onEnter={onEnter} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Welcome screen unavailable.');

    await act(async () => {
      vi.advanceTimersByTime(WELCOME_TRANSITION_DELAY_MS);
    });
    expect(onEnter).not.toHaveBeenCalled();
    container.remove();
  });

});
