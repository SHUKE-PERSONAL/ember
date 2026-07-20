// Thin typed wrappers over the Ember JSON API. All requests send the session
// cookie (credentials: 'include'); non-2xx responses throw ApiError carrying
// the server's message.

export interface User {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  bio: string | null;
  createdAt: string;
}

export interface Author {
  id: string;
  handle: string;
  displayName: string;
}

export interface Post {
  id: string;
  text: string;
  createdAt: string;
  author: Author;
}

export interface Timeline {
  posts: Post[];
  nextCursor: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
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
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body — keep statusText
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<User>('/api/me'),
  register: (body: { handle: string; displayName?: string; email: string; password: string }) =>
    request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<User>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  createPost: (text: string) =>
    request<Post>('/api/posts', { method: 'POST', body: JSON.stringify({ text }) }),
  timeline: (cursor?: string) =>
    request<Timeline>(`/api/timeline${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
};
