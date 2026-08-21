import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../auth/requireAuth.js';
import { asyncHandler } from '../util/asyncHandler.js';
import { postShape } from '../posts/routes.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const profileShape = {
  id: true,
  handle: true,
  displayName: true,
  bio: true,
  createdAt: true,
  _count: {
    select: {
      followers: true,
      following: true,
    },
  },
} as const;

async function getProfile(handle: string, viewerId: string) {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: profileShape,
  });
  if (!user) return null;

  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: viewerId,
        followingId: user.id,
      },
    },
  });

  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    bio: user.bio,
    createdAt: user.createdAt,
    followerCount: user._count.followers,
    followingCount: user._count.following,
    isFollowing: Boolean(follow),
  };
}

async function requireProfile(handle: string, viewerId: string, res: Response) {
  const profile = await getProfile(handle, viewerId);
  if (!profile) {
    res.status(404).json({ error: 'user not found' });
    return null;
  }
  return profile;
}

usersRouter.get('/users/:handle/posts', asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { handle: req.params.handle },
    select: { id: true },
  });
  if (!user) return res.status(404).json({ error: 'user not found' });

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length > 0
    ? req.query.cursor
    : undefined;

  const rows = await prisma.post.findMany({
    where: { authorId: user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: postShape,
  });

  const posts = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? posts[posts.length - 1].id : null;
  return res.json({ posts, nextCursor });
}));

usersRouter.get('/users/:handle', asyncHandler(async (req: Request, res: Response) => {
  const profile = await requireProfile(req.params.handle, req.session.userId!, res);
  if (!profile) return;
  return res.json(profile);
}));

usersRouter.post('/users/:handle/follow', asyncHandler(async (req: Request, res: Response) => {
  const profile = await requireProfile(req.params.handle, req.session.userId!, res);
  if (!profile) return;

  if (profile.id === req.session.userId) {
    return res.status(400).json({ error: 'you cannot follow yourself' });
  }

  await prisma.follow.upsert({
    where: {
      followerId_followingId: {
        followerId: req.session.userId!,
        followingId: profile.id,
      },
    },
    create: {
      followerId: req.session.userId!,
      followingId: profile.id,
    },
    update: {},
  });

  const updated = await getProfile(req.params.handle, req.session.userId!);
  return res.json(updated);
}));

usersRouter.delete('/users/:handle/follow', asyncHandler(async (req: Request, res: Response) => {
  const profile = await requireProfile(req.params.handle, req.session.userId!, res);
  if (!profile) return;

  if (profile.id === req.session.userId) {
    return res.status(400).json({ error: 'you cannot follow yourself' });
  }

  await prisma.follow.deleteMany({
    where: {
      followerId: req.session.userId!,
      followingId: profile.id,
    },
  });

  const updated = await getProfile(req.params.handle, req.session.userId!);
  return res.json(updated);
}));
