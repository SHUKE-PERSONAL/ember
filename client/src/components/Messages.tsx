import { useEffect, useState } from 'react';
import { api, ApiError, type Message as MessageData, type MessageConversation, type User } from '../api';

export function Messages({
  handle,
  user,
  logout,
}: {
  handle: string | null;
  user: User;
  logout: () => void;
}) {
  const [conversations, setConversations] = useState<MessageConversation[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [participant, setParticipant] = useState<MessageData['sender'] | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const conversationRequest = api.messages();
    const threadRequest = handle ? loadThread(handle) : Promise.resolve(null);
    Promise.all([conversationRequest, threadRequest])
      .then(([conversationList, thread]) => {
        if (!active) return;
        setConversations(conversationList.conversations);
        setMessages(thread?.messages ?? []);
        setParticipant(thread?.participant ?? null);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'could not load messages');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [handle]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!handle || !text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const message = await api.sendMessage(handle, text);
      setMessages((current) => [...current, message]);
      setText('');
      const conversationList = await api.messages();
      setConversations(conversationList.conversations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not send message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app">
      <header className="topbar">
        <h1><a href="/" className="brand-link">Ember</a></h1>
        <nav className="who">
          <a href="/search">Search</a>
          <a className="handle profile-link" href={`/@${encodeURIComponent(user.handle)}`}>
            @{user.handle}
          </a>
          <button type="button" className="link" onClick={logout}>Log out</button>
        </nav>
      </header>

      <a className="back-link" href="/">← Home</a>
      <h2 className="section-title">Messages</h2>
      {loading && <p className="muted">Loading messages…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && handle === null && (
        <ConversationList conversations={conversations} />
      )}
      {!loading && !error && handle !== null && participant && (
        <section aria-label={`Conversation with ${participant.handle}`}>
          <a className="back-link" href="/messages">← All conversations</a>
          <h3>@{participant.handle}</h3>
          <div className="message-thread">
            {messages.length === 0 && <p className="muted empty">No messages yet.</p>}
            {messages.map((message) => (
              <article className="message" key={message.id}>
                <header>
                  <strong>{message.sender.id === user.id ? 'You' : `@${message.sender.handle}`}</strong>
                  <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                </header>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
          <form className="message-compose" onSubmit={submit}>
            <textarea
              placeholder={`Message @${participant.handle}`}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
            />
            <div className="compose-actions">
              <button type="submit" disabled={busy || text.trim().length === 0}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

async function loadThread(handle: string) {
  try {
    return await api.messageThread(handle);
  } catch (err) {
    // A profile can link to a new conversation before its first message
    // exists. The API keeps that empty thread indistinguishable from an
    // inaccessible conversation; the public profile supplies the compose
    // target without exposing any message data.
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
    const profile = await api.profile(handle);
    return {
      participant: {
        id: profile.id,
        handle: profile.handle,
        displayName: profile.displayName,
      },
      messages: [],
    };
  }
}

function ConversationList({ conversations }: { conversations: MessageConversation[] }) {
  if (conversations.length === 0) {
    return <p className="muted empty">No conversations yet. Start one from a user profile.</p>;
  }

  return (
    <section aria-label="Conversations" className="conversation-list">
      {conversations.map((conversation) => (
        <a
          className="conversation"
          key={conversation.participant.id}
          href={`/messages/${encodeURIComponent(conversation.participant.handle)}`}
        >
          <span>
            <strong>{conversation.participant.displayName}</strong>{' '}
            <span className="muted">@{conversation.participant.handle}</span>
          </span>
          <span className="conversation-meta">
            {conversation.unreadCount > 0 && <strong>{conversation.unreadCount} unread</strong>}
            <time dateTime={conversation.lastMessage.createdAt}>
              {formatMessageTime(conversation.lastMessage.createdAt)}
            </time>
          </span>
        </a>
      ))}
    </section>
  );
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString();
}
