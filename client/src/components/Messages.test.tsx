// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type MessageConversation, type User } from '../api';
import { Messages } from './Messages';

const user: User = {
  id: 'viewer-id',
  handle: 'viewer',
  displayName: 'Viewer',
  email: 'viewer@example.com',
  bio: null,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const conversation: MessageConversation = {
  participant: { id: 'author-id', handle: 'author', displayName: 'Author' },
  lastMessage: {
    id: 'message-id',
    senderId: 'author-id',
    recipientId: 'viewer-id',
    createdAt: '2026-01-01T00:00:00.000Z',
    readAt: null,
  },
  unreadCount: 1,
};

describe('Messages', () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    vi.restoreAllMocks();
  });

  it('renders metadata-only conversation summaries with unread state', async () => {
    vi.spyOn(api, 'messages').mockResolvedValue({ conversations: [conversation] });
    const container = document.createElement('div');
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<Messages handle={null} user={user} logout={vi.fn()} />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Author');
    expect(container.textContent).toContain('@author');
    expect(container.textContent).toContain('1 unread');
    expect(container.querySelector('a[href="/messages/author"]')).not.toBeNull();
    container.remove();
  });
});
