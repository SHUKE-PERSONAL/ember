import { Prisma } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../util/asyncHandler.js';
import { requireAuth } from '../auth/requireAuth.js';
import { publicAuthor } from '../auth/publicUser.js';
import { graphemeCount, MAX_GRAPHEMES } from '../util/grapheme.js';
import { normalizeTopicTag, postHasTopic } from './tokens.js';

export const postsRouter = Router();

// Both routes require a session; the guard runs before every handler here.
postsRouter.use(requireAuth);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// A repost embeds this narrow original shape. Interaction state belongs to
// the displayed post row and is deliberately not duplicated in the wrapper.
const originalPostSelect = {
  id: true,
  text: true,
  replyToId: true,
  repostOfId: true,
  createdAt: true,
  author: { select: publicAuthor },
} as const;

const replyOrderBy: Prisma.PostOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

// Shape returned for a timeline/created post. Text is always returned in full;
// the 140-grapheme fold is a client display concern.
export const postSelect = (viewerId: string) => ({
  ...originalPostSelect,
  _count: { select: { likes: true } },
  likes: {
    where: { userId: viewerId },
    select: { userId: true },
  },
  reposts: {
    where: { authorId: viewerId },
    select: { id: true },
  },
  repostOf: { select: originalPostSelect },
} as const);

const detailSelect = (viewerId: string) => ({
  ...postSelect(viewerId),
  replies: {
    orderBy: replyOrderBy,
    select: postSelect(viewerId),
  },
} as const);

type PostRow = Prisma.PostGetPayload<{ select: ReturnType<typeof postSelect> }>;
type DetailRow = Prisma.PostGetPayload<{ select: ReturnType<typeof detailSelect> }>;

export function serializePost(post: PostRow) {
  const { _count, likes, reposts, ...rest } = post;
  return {
    ...rest,
    likeCount: _count.likes,
    liked: likes.length > 0,
    reposted: reposts.length > 0,
  };
}

function parsePostText(req: Request, res: Response) {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text is required' });
    return null;
  }
  if (graphemeCount(text) > MAX_GRAPHEMES) {
    res.status(422).json({ error: `text exceeds the ${MAX_GRAPHEMES}-character limit` });
    return null;
  }
  return text;
}

function postingCooldownSeconds() {
  const raw = process.env.POST_COOLDOWN_SECONDS?.trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

async function assertPostingAllowed(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId! },
    select: { emailVerifiedAt: true },
  });
  if (!user) {
    res.status(401).json({ error: 'not authenticated' });
    return false;
  }
  if (!user.emailVerifiedAt) {
    res.status(403).json({ error: 'email not verified' });
    return false;
  }

  const cooldown = postingCooldownSeconds();
  const elapsed = Math.max(0, Math.floor((Date.now() - user.emailVerifiedAt.getTime()) / 1000));
  const retryAfterSeconds = Math.max(0, cooldown - elapsed);
  if (retryAfterSeconds > 0) {
    res.status(403).json({ error: 'posting cooldown', retryAfterSeconds });
    return false;
  }
  return true;
}

function parseLimit(req: Request) {
  const rawLimit = Number(req.query.limit);
  return Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
}

function parseCursor(req: Request) {
  return typeof req.query.cursor === 'string' && req.query.cursor.length > 0
    ? req.query.cursor
    : undefined;
}

function paginateRows<T extends { id: string }>(rows: T[], cursor: string | undefined, limit: number) {
  const cursorIndex = cursor ? rows.findIndex((row) => row.id === cursor) : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const page = rows.slice(start, start + limit + 1);
  return {
    rows: page.slice(0, limit),
    nextCursor: page.length > limit ? page[limit - 1].id : null,
  };
}

postsRouter.post('/posts', asyncHandler(async (req: Request, res: Response) => {
  if (!(await assertPostingAllowed(req, res))) return;
  const text = parsePostText(req, res);
  if (text === null) return;

  const post = await prisma.post.create({
    data: { authorId: req.session.userId!, text },
    select: postSelect(req.session.userId!),
  });
  return res.status(201).json(serializePost(post));
}));

postsRouter.get('/topics/:tag/posts', asyncHandler(async (req: Request, res: Response) => {
  const tag = normalizeTopicTag(req.params.tag);
  if (!tag) return res.status(400).json({ error: 'invalid topic' });

  const rows = await prisma.post.findMany({
    where: { text: { contains: `#${tag}`, mode: 'insensitive' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: postSelect(req.session.userId!),
  });
  const matchingRows = rows.filter((post) => postHasTopic(post.text, tag));
  const page = paginateRows(matchingRows, parseCursor(req), parseLimit(req));

  return res.json({
    posts: page.rows.map(serializePost),
    nextCursor: page.nextCursor,
  });
}));

postsRouter.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) return res.json({ posts: [], users: [], nextCursor: null });

  const limit = parseLimit(req);
  const cursor = parseCursor(req);
  const [rows, users] = await Promise.all([
    prisma.post.findMany({
      where: {
        OR: [
          { text: { contains: query, mode: 'insensitive' } },
          { author: { handle: { contains: query, mode: 'insensitive' } } },
          { author: { displayName: { contains: query, mode: 'insensitive' } } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: postSelect(req.session.userId!),
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { handle: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ handle: 'asc' }],
      take: MAX_LIMIT,
      select: publicAuthor,
    }),
  ]);

  const posts = rows.slice(0, limit).map(serializePost);
  const nextCursor = rows.length > limit ? posts[posts.length - 1].id : null;
  return res.json({ posts, users, nextCursor });
}));

postsRouter.get('/posts/:id', asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    select: detailSelect(req.session.userId!),
  });
  if (!post) return res.status(404).json({ error: 'post not found' });

  const detail = post as DetailRow;
  return res.json({
    post: serializePost(detail),
    replies: detail.replies.map(serializePost),
  });
}));

postsRouter.post('/posts/:id/reply', asyncHandler(async (req: Request, res: Response) => {
  if (!(await assertPostingAllowed(req, res))) return;
  const text = parsePostText(req, res);
  if (text === null) return;

  const parent = await prisma.post.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!parent) return res.status(404).json({ error: 'post not found' });

  const reply = await prisma.post.create({
    data: {
      authorId: req.session.userId!,
      text,
      replyToId: parent.id,
    },
    select: postSelect(req.session.userId!),
  });
  return res.status(201).json(serializePost(reply));
}));

postsRouter.post('/posts/:id/like', asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!post) return res.status(404).json({ error: 'post not found' });

  await prisma.like.upsert({
    where: {
      userId_postId: {
        userId: req.session.userId!,
        postId: post.id,
      },
    },
    create: { userId: req.session.userId!, postId: post.id },
    update: {},
  });

  const likeCount = await prisma.like.count({ where: { postId: post.id } });
  return res.json({ liked: true, likeCount });
}));

postsRouter.delete('/posts/:id/like', asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!post) return res.status(404).json({ error: 'post not found' });

  await prisma.like.deleteMany({
    where: { userId: req.session.userId!, postId: post.id },
  });
  const likeCount = await prisma.like.count({ where: { postId: post.id } });
  return res.json({ liked: false, likeCount });
}));

postsRouter.post('/posts/:id/repost', asyncHandler(async (req: Request, res: Response) => {
  if (!(await assertPostingAllowed(req, res))) return;
  const original = await prisma.post.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!original) return res.status(404).json({ error: 'post not found' });

  const repost = await prisma.post.upsert({
    where: {
      authorId_repostOfId: {
        authorId: req.session.userId!,
        repostOfId: original.id,
      },
    },
    create: {
      authorId: req.session.userId!,
      text: '',
      repostOfId: original.id,
    },
    update: {},
    select: postSelect(req.session.userId!),
  });
  return res.status(201).json({ reposted: true, post: serializePost(repost) });
}));

postsRouter.delete('/posts/:id/repost', asyncHandler(async (req: Request, res: Response) => {
  const original = await prisma.post.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!original) return res.status(404).json({ error: 'post not found' });

  const reposts = await prisma.post.findMany({
    where: { authorId: req.session.userId!, repostOfId: original.id },
    select: { id: true },
  });
  if (reposts.length > 0) {
    const repostIds = reposts.map((repost) => repost.id);
    await prisma.$transaction(async (tx) => {
      // Likes point at the repost row, so remove those before deleting the
      // wrapper. Likes on the original post are unaffected.
      await tx.like.deleteMany({ where: { postId: { in: repostIds } } });
      await tx.post.deleteMany({ where: { id: { in: repostIds } } });
    });
  }
  return res.json({ reposted: false });
}));

postsRouter.get('/timeline', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  const limit = parseLimit(req);
  const cursor = parseCursor(req);

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
    select: postSelect(userId),
  });

  const posts = rows.slice(0, limit).map(serializePost);
  const nextCursor = rows.length > limit ? posts[posts.length - 1].id : null;
  return res.json({ posts, nextCursor });
}));
