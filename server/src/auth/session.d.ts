import 'express-session';

// Augment the session with the authenticated user's id.
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
