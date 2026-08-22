import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../db.js';
import { verifyPassword } from './password.js';

export interface ApiKeyContext {
  id: string;
  userId: string;
  name: string;
  scopes: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    apiKey?: ApiKeyContext;
    apiKeyUserId?: string;
  }
}

function unauthorized(res: Response) {
  res.status(401).json({ error: 'invalid API key' });
}

function bearerToken(req: Request) {
  const header = req.get('authorization')?.trim();
  if (!header) return null;

  const parts = header.split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) return null;
  return parts[1];
}

export const requireApiKey: RequestHandler = (req, res, next: NextFunction) => {
  const token = bearerToken(req);
  if (!token) {
    unauthorized(res);
    return;
  }

  void prisma.apiKey
    .findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, userId: true, keyHash: true, name: true, scopes: true },
    })
    .then(async (keys) => {
      let matchedKey: (typeof keys)[number] | undefined;
      for (const key of keys) {
        if (await verifyPassword(token, key.keyHash)) {
          matchedKey = key;
          break;
        }
      }

      if (!matchedKey) {
        unauthorized(res);
        return;
      }

      req.apiKey = {
        id: matchedKey.id,
        userId: matchedKey.userId,
        name: matchedKey.name,
        scopes: matchedKey.scopes,
      };
      req.apiKeyUserId = matchedKey.userId;
      await prisma.apiKey.update({
        where: { id: matchedKey.id },
        data: { lastUsedAt: new Date() },
      });
      next();
    })
    .catch(next);
};
