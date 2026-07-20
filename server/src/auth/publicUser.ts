// Prisma `select` shapes that never leak passwordHash.

// Full self-facing shape returned by the auth endpoints (own account).
export const publicUser = {
  id: true,
  handle: true,
  displayName: true,
  email: true,
  bio: true,
  createdAt: true,
} as const;

// Narrower shape for referencing *other* users (e.g. a post's author in the
// timeline). Deliberately omits email — a timeline must not leak every
// author's address.
export const publicAuthor = {
  id: true,
  handle: true,
  displayName: true,
} as const;
