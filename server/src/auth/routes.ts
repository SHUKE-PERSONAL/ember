import { Router, type Request, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { hashPassword, verifyPassword } from './password.js';
import { asyncHandler } from '../util/asyncHandler.js';
import { publicUser } from './publicUser.js';
import { requireAuth } from './requireAuth.js';
import {
  ACTIVATION_TOKEN_TTL_MS,
  createVerificationToken,
  hashVerificationToken,
} from './verification.js';
import { sendActivationEmail } from '../mail/index.js';

export const authRouter = Router();

const RESEND_COOLDOWN_MS = 60 * 1000;
const resendAtByUser = new Map<string, number>();

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function activationLink(token: string) {
  const appUrl = (process.env.APP_URL?.trim() || 'http://localhost:5173').replace(/\/+$/, '');
  return `${appUrl}/activate?token=${encodeURIComponent(token)}`;
}

async function issueActivationToken(userId: string) {
  const token = createVerificationToken();
  await prisma.$transaction([
    prisma.emailVerification.deleteMany({ where: { userId } }),
    prisma.emailVerification.create({
      data: {
        userId,
        tokenHash: hashVerificationToken(token),
        expiresAt: new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS),
      },
    }),
  ]);
  return token;
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
    const token = await issueActivationToken(user.id);
    await sendActivationEmail(user.email, activationLink(token));
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

authRouter.post('/auth/activate', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body ?? {};
  if (!isNonEmptyString(token)) {
    return res.status(400).json({ error: 'token is required' });
  }

  const verification = await prisma.emailVerification.findUnique({
    where: { tokenHash: hashVerificationToken(token) },
    select: { id: true },
  });
  if (!verification) {
    return res.status(400).json({ error: 'invalid or expired activation token' });
  }

  const user = await prisma.$transaction(async (tx) => {
    const current = await tx.emailVerification.findUnique({
      where: { id: verification.id },
      include: { user: true },
    });
    if (!current || current.expiresAt.getTime() <= Date.now()) {
      if (current) await tx.emailVerification.delete({ where: { id: current.id } });
      return null;
    }

    const activated = await tx.user.update({
      where: { id: current.userId },
      data: { emailVerifiedAt: current.user.emailVerifiedAt ?? new Date() },
      select: publicUser,
    });
    await tx.emailVerification.delete({ where: { id: current.id } });
    return activated;
  });

  if (!user) return res.status(400).json({ error: 'invalid or expired activation token' });
  return res.json(user);
}));

authRouter.post('/auth/resend-activation', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId! },
    select: publicUser,
  });
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'not authenticated' });
  }
  if (user.emailVerifiedAt) return res.json(user);

  const now = Date.now();
  const lastSentAt = resendAtByUser.get(user.id);
  if (lastSentAt !== undefined && now - lastSentAt < RESEND_COOLDOWN_MS) {
    return res.status(429).json({
      error: 'activation resend throttled',
      retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000),
    });
  }

  resendAtByUser.set(user.id, now);
  const token = await issueActivationToken(user.id);
  await sendActivationEmail(user.email, activationLink(token));
  return res.json(user);
}));

authRouter.post('/auth/login', asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body ?? {};
  if (!isNonEmptyString(identifier) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'identifier and password are required' });
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { handle: identifier }] },
  });
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
