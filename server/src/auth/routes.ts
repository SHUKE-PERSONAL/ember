import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from './password.js';

export const authRouter = Router();

// Express 4 does not forward errors thrown in async handlers to the error
// middleware — an unhandled rejection would hang the request. Wrap async
// handlers so their rejections reach next().
function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

// Shape returned to clients — never includes passwordHash.
const publicUser = {
  id: true,
  handle: true,
  displayName: true,
  email: true,
  bio: true,
  createdAt: true,
} as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

authRouter.post('/auth/register', asyncHandler(async (req: Request, res: Response) => {
  const { handle, displayName, email, password, bio } = req.body ?? {};
  if (!isNonEmptyString(handle) || !isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'handle, email, and password are required' });
  }

  try {
    const user = await prisma.user.create({
      data: {
        handle,
        displayName: isNonEmptyString(displayName) ? displayName : handle,
        email,
        passwordHash: await hashPassword(password),
        bio: isNonEmptyString(bio) ? bio : null,
      },
      select: publicUser,
    });
    req.session.userId = user.id;
    return res.status(201).json(user);
  } catch (err) {
    // Unique constraint (handle or email already taken).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'handle or email already in use' });
    }
    throw err;
  }
}));

authRouter.post('/auth/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  req.session.userId = user.id;
  const { passwordHash: _passwordHash, ...safe } = user;
  return res.json(safe);
}));

authRouter.post('/auth/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

authRouter.get('/me', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'not authenticated' });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
  if (!user) {
    // Session references a deleted user — clear it.
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'not authenticated' });
  }
  return res.json(user);
}));
