import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../db.js';
import { createApp } from '../index.js';
import { verifyPassword } from './password.js';

const app = createApp();

async function registerAndVerify(agent: ReturnType<typeof request.agent>, handle: string) {
  const registration = await agent.post('/api/auth/register').send({
    handle,
    email: `${handle}@example.com`,
    password: 'correct-horse',
  });
  expect(registration.status).toBe(201);
  await prisma.user.update({
    where: { id: registration.body.id },
    data: { emailVerifiedAt: new Date() },
  });
  return registration.body.id as string;
}

describe('API key management', () => {
  it('creates a key once, lists it without secrets, and revokes it by owner', async () => {
    const owner = request.agent(app);
    const otherUser = request.agent(app);
    await registerAndVerify(owner, 'api-key-owner');
    await registerAndVerify(otherUser, 'api-key-other');

    const created = await owner.post('/api/apikeys').send({
      name: 'HappyNotes sync',
      scopes: 'posts:write,posts:read',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'HappyNotes sync',
      scopes: 'posts:write,posts:read',
    });
    expect(created.body.key).toMatch(/^emb_[A-Za-z0-9_-]+$/);
    expect(created.body.keyHash).toBeUndefined();

    const stored = await prisma.apiKey.findUnique({ where: { id: created.body.id } });
    expect(stored).not.toBeNull();
    expect(stored!.keyHash).not.toBe(created.body.key);
    expect(await verifyPassword(created.body.key, stored!.keyHash)).toBe(true);

    const listed = await owner.get('/api/apikeys');
    expect(listed.status).toBe(200);
    expect(listed.body.apiKeys).toHaveLength(1);
    expect(listed.body.apiKeys[0]).toMatchObject({
      id: created.body.id,
      name: 'HappyNotes sync',
      scopes: 'posts:write,posts:read',
    });
    expect(listed.body.apiKeys[0].key).toBeUndefined();
    expect(listed.body.apiKeys[0].keyHash).toBeUndefined();

    const forbiddenDelete = await otherUser.delete(`/api/apikeys/${created.body.id}`);
    expect(forbiddenDelete.status).toBe(404);
    const revoked = await owner.delete(`/api/apikeys/${created.body.id}`);
    expect(revoked.status).toBe(204);
    expect((await owner.get('/api/apikeys')).body.apiKeys).toHaveLength(0);
  });

  it('rejects malformed, unknown, and expired bearer keys', async () => {
    const agent = request.agent(app);
    await registerAndVerify(agent, 'api-key-expiry');
    const created = await agent.post('/api/apikeys').send({ name: 'expiring key' });
    expect(created.status).toBe(201);

    const malformed = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Basic not-bearer')
      .send({ text: 'bad', source: 'test', externalId: 'bad' });
    expect(malformed.status).toBe(401);

    const unknown = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer not-a-real-key')
      .send({ text: 'bad', source: 'test', externalId: 'unknown' });
    expect(unknown.status).toBe(401);

    await prisma.apiKey.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${created.body.key}`)
      .send({ text: 'expired', source: 'test', externalId: 'expired' });
    expect(expired.status).toBe(401);
  });
});
