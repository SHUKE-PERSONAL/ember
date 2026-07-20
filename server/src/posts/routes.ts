import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../util/asyncHandler.js';
import { requireAuth } from '../auth/requireAuth.js';
import { publicAuthor } from '../auth/publicUser.js';
import { graphemeCount, MAX_GRAPHEMES } from '../util/grapheme.js';

export const postsRouter = Router();

// Both routes require a session; the guard runs before every handler here.
postsRouter.use(requireAuth);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Shape returned for a timeline/created post. Full text is always returned —
// the 140-grapheme fold is a display concern (#3).
const postShape = {
  id: true,
  text: true,
  createdAt: true,
  author: { select: publicAuthor },
} as const;

postsRouter.post('/posts', asyncHandler(async (req: Request, res: Response) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }
  // Only the anti-abuse ceiling is enforced; 140 is a client-side soft hint.
  if (graphemeCount(text) > MAX_GRAPHEMES) {
    return res.status(422).json({ error: `text exceeds the ${MAX_GRAPHEMES}-character limit` });
  }

  const post = await prisma.post.create({
    data: { authorId: req.session.userId!, text },
    select: postShape,
  });
  return res.status(201).json(post);
}));

postsRouter.get('/timeline', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length > 0
    ? req.query.cursor
    : undefined;

  const followed = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const authorIds = [userId, ...followed.map((f) => f.followingId)];

  // Fetch one extra to detect whether another page exists.
  const rows = await prisma.post.findMany({
    where: { authorId: { in: authorIds } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: postShape,
  });

  const posts = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? posts[posts.length - 1].id : null;
  return res.json({ posts, nextCursor });
}));
