import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { WelcomeAction } from './WelcomeScreen';

describe('WelcomeAction', () => {
  it('calls the auth-flow callback when Enter the BBS is clicked', () => {
    let entered = false;
    const button = WelcomeAction({ onEnter: () => { entered = true; }, disabled: false }) as ReactElement<{
      onClick: () => void;
    }>;

    button.props.onClick();

    expect(entered).toBe(true);
  });
});
