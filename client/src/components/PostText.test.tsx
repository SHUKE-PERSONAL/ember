// @vitest-environment happy-dom

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { PostText } from './PostText';

describe('PostText', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
  });

  it('links mentions and topics while preserving punctuation and email text', async () => {
    const container = document.createElement('div');
    await act(async () => {
      root = createRoot(container);
      root.render(<PostText text="Hi @ada, #Ember! ada@example.com" />);
      await Promise.resolve();
    });

    expect(container.querySelector('a[href="/@ada"]')?.textContent).toBe('@ada');
    expect(container.querySelector('a[href="/topic/ember"]')?.textContent).toBe('#Ember');
    expect(container.textContent).toBe('Hi @ada, #Ember! ada@example.com');
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
