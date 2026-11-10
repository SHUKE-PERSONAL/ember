// Thin typed wrappers over the Ember JSON API. All requests send the session
// cookie (credentials: 'include'); non-2xx responses throw ApiError carrying
// the server's message.

export interface User {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  bio: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export type ActivationEmailDelivery = 'sent' | 'logged' | 'not-needed';

export interface ActivationEmailResponse extends User {
  emailDelivery: ActivationEmailDelivery;
}

export function activationDeliveryMessage(delivery: ActivationEmailDelivery, email?: string) {
  if (delivery === 'logged') {
    return 'Activation link logged for development; check the server logs.';
  }
  if (delivery === 'not-needed') return 'Your email is already verified.';
  return email ? `We sent an activation link to ${email}.` : 'Activation email sent.';
}

export interface ApiKeyMetadata {
  id: string;
  name: string;
  scopes: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiKeyList {
  apiKeys: ApiKeyMetadata[];
}

export interface CreatedApiKey extends ApiKeyMetadata {
  key: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: string;
  expiresAt?: string;
}

export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface Author {
  id: string;
  handle: string;
  displayName: string;
}

export interface OriginalPost {
  id: string;
  text: string;
  replyToId: string | null;
  repostOfId: string | null;
  createdAt: string;
  author: Author;
}

export interface Post {
  id: string;
  text: string;
  replyToId: string | null;
  repostOfId: string | null;
  createdAt: string;
  author: Author;
  likeCount: number;
  liked: boolean;
  reposted: boolean;
  repostOf: OriginalPost | null;
}

export interface Timeline {
  posts: Post[];
  nextCursor: string | null;
}

export interface SearchResults extends Timeline {
  users: Author[];
}

export interface PostDetail {
  post: Post;
  replies: Post[];
}

export interface LikeState {
  liked: boolean;
  likeCount: number;
}

export interface RepostState {
  reposted: boolean;
  post?: Post;
}

export interface Message {
  id: string;
  sender: Author;
  recipient: Author;
  text: string;
  createdAt: string;
  readAt: string | null;
}

export interface MessageConversation {
  participant: Author;
  lastMessage: {
    id: string;
    senderId: string;
    recipientId: string;
    createdAt: string;
    readAt: string | null;
  };
  unreadCount: number;
}

export interface MessageList {
  conversations: MessageConversation[];
}

export interface MessageThread {
  participant: Author;
  messages: Message[];
}

function userPath(handle: string) {
  return `/api/users/${encodeURIComponent(handle)}`;
}

interface ApiKeyResponse extends ApiKeyMetadata {
  [field: string]: unknown;
}

function projectApiKeyMetadata(apiKey: ApiKeyResponse): ApiKeyMetadata {
  return {
    id: apiKey.id,
    name: apiKey.name,
    scopes: apiKey.scopes,
    expiresAt: apiKey.expiresAt,
    lastUsedAt: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
  };
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    let body: { error?: unknown; [key: string]: unknown } | undefined;
    try {
      body = await res.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new ApiError(res.status, message, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<User>('/api/me'),
  register: (body: { handle: string; displayName?: string; email: string; password: string }) =>
    request<ActivationEmailResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  activate: (token: string) =>
    request<User>('/api/auth/activate', { method: 'POST', body: JSON.stringify({ token }) }),
  resendActivation: () =>
    request<ActivationEmailResponse>('/api/auth/resend-activation', { method: 'POST' }),
  login: (body: { identifier: string; password: string }) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<void>('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
  apiKeys: async (): Promise<ApiKeyList> => {
    const response = await request<{ apiKeys: ApiKeyResponse[] }>('/api/apikeys');
    return { apiKeys: response.apiKeys.map(projectApiKeyMetadata) };
  },
  createApiKey: async (body: CreateApiKeyInput): Promise<CreatedApiKey> => {
    const response = await request<ApiKeyResponse & { key: string }>('/api/apikeys', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { ...projectApiKeyMetadata(response), key: response.key };
  },
  revokeApiKey: (id: string) =>
    request<void>(`/api/apikeys/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  createPost: (text: string) =>
    request<Post>('/api/posts', { method: 'POST', body: JSON.stringify({ text }) }),
  postDetail: (id: string) =>
    request<PostDetail>(`/api/posts/${encodeURIComponent(id)}`),
  reply: (id: string, text: string) =>
    request<Post>(`/api/posts/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  like: (id: string) =>
    request<LikeState>(`/api/posts/${encodeURIComponent(id)}/like`, { method: 'POST' }),
  unlike: (id: string) =>
    request<LikeState>(`/api/posts/${encodeURIComponent(id)}/like`, { method: 'DELETE' }),
  repost: (id: string) =>
    request<RepostState>(`/api/posts/${encodeURIComponent(id)}/repost`, { method: 'POST' }),
  unrepost: (id: string) =>
    request<RepostState>(`/api/posts/${encodeURIComponent(id)}/repost`, { method: 'DELETE' }),
  timeline: (cursor?: string) =>
    request<Timeline>(`/api/timeline${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  topicPosts: (tag: string, cursor?: string) =>
    request<Timeline>(`/api/topics/${encodeURIComponent(tag)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  search: (query: string, cursor?: string) => {
    const params = new URLSearchParams({ q: query });
    if (cursor) params.set('cursor', cursor);
    return request<SearchResults>(`/api/search?${params.toString()}`);
  },
  profile: (handle: string) => request<Profile>(userPath(handle)),
  profilePosts: (handle: string, cursor?: string) =>
    request<Timeline>(`${userPath(handle)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  follow: (handle: string) =>
    request<Profile>(`${userPath(handle)}/follow`, { method: 'POST' }),
  unfollow: (handle: string) =>
    request<Profile>(`${userPath(handle)}/follow`, { method: 'DELETE' }),
  messages: () => request<MessageList>('/api/messages'),
  messageThread: (handle: string) =>
    request<MessageThread>(`/api/messages/${encodeURIComponent(handle)}`),
  sendMessage: (handle: string, text: string) =>
    request<Message>(`/api/messages/${encodeURIComponent(handle)}`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};
