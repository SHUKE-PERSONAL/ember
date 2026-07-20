import type { Request, Response, NextFunction } from 'express';

// Gate for authenticated routes. Rejects with 401 when there is no session
// user; downstream handlers can then treat req.session.userId as present.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'not authenticated' });
    return;
  }
  next();
}
