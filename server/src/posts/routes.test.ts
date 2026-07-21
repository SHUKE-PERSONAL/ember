import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';

const app = createApp();

describe('POST /api/posts', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/posts').send({ text: 'hello' });
    expect(res.status).toBe(401);
  });

  it('creates a post for an authenticated user and returns the post shape', async () => {
    // A supertest agent persists the session cookie across requests.
    const agent = request.agent(app);

    const register = await agent.post('/api/auth/register').send({
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
