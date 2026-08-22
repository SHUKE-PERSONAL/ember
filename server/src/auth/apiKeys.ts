import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../util/asyncHandler.js';
import { hashPassword } from './password.js';
import { requireAuth } from './requireAuth.js';

export const apiKeysRouter = Router();
apiKeysRouter.use('/apikeys', requireAuth);

const apiKeyListSelect = {
  id: true,
  name: true,
  scopes: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseExpiresAt(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;

  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) ? undefined : expiresAt;
}

apiKeysRouter.post('/apikeys', asyncHandler(async (req: Request, res: Response) => {
  const { name, scopes = '', expiresAt: expiresAtValue } = req.body ?? {};
  if (!isNonEmptyString(name) || (typeof scopes !== 'string' && scopes !== undefined)) {
    return res.status(400).json({ error: 'name and scopes are required' });
  }

  const expiresAt = parseExpiresAt(expiresAtValue);
  if (expiresAt === undefined) {
    return res.status(400).json({ error: 'expiresAt must be a valid date' });
  }

  const key = `emb_${randomBytes(32).toString('base64url')}`;
  const apiKey = await prisma.apiKey.create({
    data: {
      userId: req.session.userId!,
      keyHash: await hashPassword(key),
      name: name.trim(),
      scopes: scopes.trim(),
      expiresAt,
    },
    select: apiKeyListSelect,
  });

  return res.status(201).json({ ...apiKey, key });
}));

apiKeysRouter.get('/apikeys', asyncHandler(async (req: Request, res: Response) => {
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: req.session.userId! },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: apiKeyListSelect,
  });
  return res.json({ apiKeys });
}));

apiKeysRouter.delete('/apikeys/:id', asyncHandler(async (req: Request, res: Response) => {
  const result = await prisma.apiKey.deleteMany({
    where: { id: req.params.id, userId: req.session.userId! },
  });
  if (result.count === 0) return res.status(404).json({ error: 'API key not found' });
  return res.status(204).end();
}));
