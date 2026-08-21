import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { prisma } from '../db.js';
import { createApp } from '../index.js';

const app = createApp();

async function registerAndVerify(agent: ReturnType<typeof request.agent>, data: Record<string, string>) {
  const registration = await agent.post('/api/auth/register').send(data);
  expect(registration.status).toBe(201);
  await prisma.user.update({
    where: { id: registration.body.id },
    data: { emailVerifiedAt: new Date() },
  });
  return registration;
}

describe('POST /api/posts', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/posts').send({ text: 'hello' });
    expect(res.status).toBe(401);
  });

  it('creates a post for an authenticated user and returns the post shape', async () => {
    // A supertest agent persists the session cookie across requests.
    const agent = request.agent(app);

    const register = await registerAndVerify(agent, {
      handle: 'ada',
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    expect(register.status).toBe(201);

    const res = await agent.post('/api/posts').send({ text: 'first post' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      text: 'first post',
      author: { handle: 'ada' },
    });
    expect(typeof res.body.id).toBe('string');
    expect(typeof res.body.createdAt).toBe('string');
  });
});

describe('email activation posting gate', () => {
  it('blocks post creation actions while leaving likes and follows available', async () => {
    const unverified = request.agent(app);
    const verified = request.agent(app);
    await unverified.post('/api/auth/register').send({
      handle: 'unverified-poster',
      email: 'unverified-poster@example.com',
      password: 'correct-horse',
    });
    await registerAndVerify(verified, {
      handle: 'verified-author',
      email: 'verified-author@example.com',
      password: 'correct-horse',
    });

    const original = await verified.post('/api/posts').send({ text: 'activation target' });
    expect(original.status).toBe(201);
    const post = await unverified.post('/api/posts').send({ text: 'blocked post' });
    expect(post.status).toBe(403);
    expect(post.body).toEqual({ error: 'email not verified' });

    const reply = await unverified.post(`/api/posts/${original.body.id}/reply`).send({ text: 'blocked reply' });
    expect(reply.status).toBe(403);
    expect(reply.body).toEqual({ error: 'email not verified' });
    const repost = await unverified.post(`/api/posts/${original.body.id}/repost`);
    expect(repost.status).toBe(403);
    expect(repost.body).toEqual({ error: 'email not verified' });

    const like = await unverified.post(`/api/posts/${original.body.id}/like`);
    expect(like.status).toBe(200);
    const follow = await unverified.post('/api/users/verified-author/follow');
    expect(follow.status).toBe(200);
  });

  it('reads cooldown settings per request and falls back safely for invalid values', async () => {
    const previousCooldown = process.env.POST_COOLDOWN_SECONDS;
    const agent = request.agent(app);
    await registerAndVerify(agent, {
      handle: 'cooldown-user',
      email: 'cooldown-user@example.com',
      password: 'correct-horse',
    });

    try {
      process.env.POST_COOLDOWN_SECONDS = '3600';
      const blocked = await agent.post('/api/posts').send({ text: 'wait' });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toBe('posting cooldown');
      expect(blocked.body.retryAfterSeconds).toEqual(expect.any(Number));
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);

      process.env.POST_COOLDOWN_SECONDS = 'not-a-number';
      const invalidValue = await agent.post('/api/posts').send({ text: 'invalid is safe' });
      expect(invalidValue.status).toBe(201);

      process.env.POST_COOLDOWN_SECONDS = '0';
      const reset = await agent.post('/api/posts').send({ text: 'cooldown reset' });
      expect(reset.status).toBe(201);
    } finally {
      if (previousCooldown === undefined) delete process.env.POST_COOLDOWN_SECONDS;
      else process.env.POST_COOLDOWN_SECONDS = previousCooldown;
    }
  });
});

describe('user profiles and follows', () => {
  it('returns a profile, keeps authored posts scoped, and updates follow state', async () => {
    const author = request.agent(app);
    const follower = request.agent(app);

    await registerAndVerify(author, {
      handle: 'profile-author',
      displayName: 'Profile Author',
      email: 'profile-author@example.com',
      password: 'correct-horse',
      bio: 'Writes posts',
    });
    await author.post('/api/posts').send({ text: 'author post' });
    await registerAndVerify(follower, {
      handle: 'profile-follower',
      email: 'profile-follower@example.com',
      password: 'correct-horse',
    });
    await follower.post('/api/posts').send({ text: 'follower post' });

    const initial = await follower.get('/api/users/profile-author');
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      handle: 'profile-author',
      displayName: 'Profile Author',
      bio: 'Writes posts',
      followerCount: 0,
      followingCount: 0,
      isFollowing: false,
    });

    const posts = await follower.get('/api/users/profile-author/posts');
    expect(posts.status).toBe(200);
    expect(posts.body.posts).toHaveLength(1);
    expect(posts.body.posts[0]).toMatchObject({
      text: 'author post',
      author: { handle: 'profile-author' },
    });

    const followed = await follower.post('/api/users/profile-author/follow');
    expect(followed.status).toBe(200);
    expect(followed.body).toMatchObject({
      followerCount: 1,
      isFollowing: true,
    });

    const timeline = await follower.get('/api/timeline');
    expect(timeline.body.posts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: 'author post',
        author: expect.objectContaining({ handle: 'profile-author' }),
      }),
    ]));

    const unfollowed = await follower.delete('/api/users/profile-author/follow');
    expect(unfollowed.status).toBe(200);
    expect(unfollowed.body).toMatchObject({
      followerCount: 0,
      isFollowing: false,
    });
  });

  it('rejects self-follow and paginates profile posts', async () => {
    const agent = request.agent(app);
    await registerAndVerify(agent, {
      handle: 'pagination-author',
      email: 'pagination-author@example.com',
      password: 'correct-horse',
    });
    await agent.post('/api/posts').send({ text: 'page one' });
    await agent.post('/api/posts').send({ text: 'page two' });
    await agent.post('/api/posts').send({ text: 'page three' });

    const selfFollow = await agent.post('/api/users/pagination-author/follow');
    expect(selfFollow.status).toBe(400);

    const firstPage = await agent
      .get('/api/users/pagination-author/posts')
      .query({ limit: 2 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.posts).toHaveLength(2);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));

    const secondPage = await agent
      .get('/api/users/pagination-author/posts')
      .query({ limit: 2, cursor: firstPage.body.nextCursor });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.posts).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();
    expect([
      ...firstPage.body.posts,
      ...secondPage.body.posts,
    ].map((post: { text: string }) => post.text).sort()).toEqual([
      'page one',
      'page three',
      'page two',
    ]);
  });
});

describe('post interactions', () => {
  it('supports idempotent likes and full-text replies on post detail', async () => {
    const author = request.agent(app);
    const liker = request.agent(app);

    await registerAndVerify(author, {
      handle: 'interaction-author',
      email: 'interaction-author@example.com',
      password: 'correct-horse',
    });
    await registerAndVerify(liker, {
      handle: 'interaction-liker',
      email: 'interaction-liker@example.com',
      password: 'correct-horse',
    });

    const created = await author.post('/api/posts').send({ text: 'the original' });
    expect(created.status).toBe(201);
    const postId = created.body.id;

    const firstLike = await liker.post(`/api/posts/${postId}/like`);
    expect(firstLike.status).toBe(200);
    expect(firstLike.body).toEqual({ liked: true, likeCount: 1 });
    const duplicateLike = await liker.post(`/api/posts/${postId}/like`);
    expect(duplicateLike.body).toEqual({ liked: true, likeCount: 1 });

    const unlike = await liker.delete(`/api/posts/${postId}/like`);
    expect(unlike.body).toEqual({ liked: false, likeCount: 0 });
    const duplicateUnlike = await liker.delete(`/api/posts/${postId}/like`);
    expect(duplicateUnlike.body).toEqual({ liked: false, likeCount: 0 });

    const longReplyText = '界'.repeat(141);
    const reply = await liker.post(`/api/posts/${postId}/reply`).send({ text: longReplyText });
    expect(reply.status).toBe(201);
    expect(reply.body.text).toBe(longReplyText);
    expect(reply.body.replyToId).toBe(postId);

    const tooLong = await liker
      .post(`/api/posts/${postId}/reply`)
      .send({ text: '界'.repeat(1025) });
    expect(tooLong.status).toBe(422);

    const detail = await author.get(`/api/posts/${postId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.post.text).toBe('the original');
    expect(detail.body.replies).toHaveLength(1);
    expect(detail.body.replies[0].text).toBe(longReplyText);

    const timeline = await liker.get('/api/timeline');
    expect(timeline.body.posts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: reply.body.id, text: longReplyText }),
    ]));
  });

  it('creates one repost and delivers it to a reposter follower', async () => {
    const author = request.agent(app);
    const reposter = request.agent(app);
    const follower = request.agent(app);

    await registerAndVerify(author, {
      handle: 'repost-author',
      email: 'repost-author@example.com',
      password: 'correct-horse',
    });
    await registerAndVerify(reposter, {
      handle: 'reposter',
      email: 'reposter@example.com',
      password: 'correct-horse',
    });
    await registerAndVerify(follower, {
      handle: 'repost-follower',
      email: 'repost-follower@example.com',
      password: 'correct-horse',
    });
    await follower.post('/api/users/reposter/follow');

    const original = await author.post('/api/posts').send({ text: 'share this' });
    const first = await reposter.post(`/api/posts/${original.body.id}/repost`);
    expect(first.status).toBe(201);
    expect(first.body.reposted).toBe(true);
    expect(first.body.post.repostOf).toMatchObject({
      id: original.body.id,
      text: 'share this',
    });

    const duplicate = await reposter.post(`/api/posts/${original.body.id}/repost`);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.post.id).toBe(first.body.post.id);

    const reposts = await reposter.get('/api/users/reposter/posts');
    expect(reposts.body.posts.filter((post: { repostOfId: string | null }) => post.repostOfId).length)
      .toBe(1);

    const timeline = await follower.get('/api/timeline');
    expect(timeline.body.posts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: first.body.post.id,
        author: expect.objectContaining({ handle: 'reposter' }),
        repostOf: expect.objectContaining({
          id: original.body.id,
          text: 'share this',
        }),
      }),
    ]));

    const repostLike = await follower.post(`/api/posts/${first.body.post.id}/like`);
    expect(repostLike.body).toEqual({ liked: true, likeCount: 1 });
    const unrepost = await reposter.delete(`/api/posts/${original.body.id}/repost`);
    expect(unrepost.body).toEqual({ reposted: false });
    const duplicateUnrepost = await reposter.delete(`/api/posts/${original.body.id}/repost`);
    expect(duplicateUnrepost.body).toEqual({ reposted: false });
  });
});

describe('mentions, topics, and search', () => {
  it('lists exact topic matches newest first and finds users and posts', async () => {
    const agent = request.agent(app);
    await registerAndVerify(agent, {
      handle: 'search-user',
      displayName: 'Search Person',
      email: 'search-user@example.com',
      password: 'correct-horse',
    });

    const older = await agent.post('/api/posts').send({
      text: 'older #Ember post, with @search-user',
    });
    const newer = await agent.post('/api/posts').send({
      text: 'newer #ember post',
    });
    await agent.post('/api/posts').send({ text: '#embers is different' });

    const topic = await agent.get('/api/topics/ember/posts');
    expect(topic.status).toBe(200);
    expect(topic.body.posts.map((post: { id: string }) => post.id)).toEqual([
      newer.body.id,
      older.body.id,
    ]);
    expect(topic.body.posts[0].text).toBe('newer #ember post');

    const search = await agent.get('/api/search').query({ q: 'search' });
    expect(search.status).toBe(200);
    expect(search.body.users).toEqual([
      expect.objectContaining({ handle: 'search-user', displayName: 'Search Person' }),
    ]);
    expect(search.body.posts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: older.body.id }),
    ]));

    const empty = await agent.get('/api/search').query({ q: '   ' });
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ posts: [], users: [], nextCursor: null });
  });
});
