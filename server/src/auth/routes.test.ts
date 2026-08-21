import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../db.js';
import { createApp } from '../index.js';
import { hashVerificationToken } from './verification.js';

const app = createApp();

async function registerAndGetToken(agent: ReturnType<typeof request.agent>, data: Record<string, string>) {
  const previousApiKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    const registration = await agent.post('/api/auth/register').send(data);
    const activationLog = log.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes('/activate?token='));
    if (!activationLog) throw new Error('activation link was not logged');
    const link = activationLog.slice(activationLog.indexOf('http'));
    const token = new URL(link).searchParams.get('token');
    if (!token) throw new Error('activation token was not logged');
    return { registration, token };
  } finally {
    log.mockRestore();
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
  }
}

describe('POST /api/auth/login', () => {
  it('authenticates with either the registered email or handle', async () => {
    const registration = await request(app).post('/api/auth/register').send({
      handle: 'login-user',
      email: 'login-user@example.com',
      password: 'correct-horse',
    });
    expect(registration.status).toBe(201);

    const byEmail = await request(app).post('/api/auth/login').send({
      identifier: 'login-user@example.com',
      password: 'correct-horse',
    });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body).toMatchObject({ handle: 'login-user', email: 'login-user@example.com' });
    expect(byEmail.body.passwordHash).toBeUndefined();

    const byHandle = await request(app).post('/api/auth/login').send({
      identifier: 'login-user',
      password: 'correct-horse',
    });
    expect(byHandle.status).toBe(200);
    expect(byHandle.body).toMatchObject({ handle: 'login-user', email: 'login-user@example.com' });
    expect(byHandle.body.passwordHash).toBeUndefined();
  });

  it('returns invalid credentials for an unknown identifier', async () => {
    const response = await request(app).post('/api/auth/login').send({
      identifier: 'does-not-exist',
      password: 'correct-horse',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid credentials' });
  });
});

describe('POST /api/auth/register', () => {
  it('still requires separate handle and email fields', async () => {
    const missingHandle = await request(app).post('/api/auth/register').send({
      email: 'missing-handle@example.com',
      password: 'correct-horse',
    });
    expect(missingHandle.status).toBe(400);

    const missingEmail = await request(app).post('/api/auth/register').send({
      handle: 'missing-email',
      password: 'correct-horse',
    });
    expect(missingEmail.status).toBe(400);
  });
});

describe('email activation', () => {
  it('activates a valid token, exposes verification state, and rejects reuse', async () => {
    const agent = request.agent(app);
    const { registration, token } = await registerAndGetToken(agent, {
      handle: 'activation-user',
      email: 'activation-user@example.com',
      password: 'correct-horse',
    });

    expect(registration.status).toBe(201);
    expect(registration.body.emailVerifiedAt).toBeNull();

    const activation = await agent.post('/api/auth/activate').send({ token });
    expect(activation.status).toBe(200);
    expect(activation.body).toMatchObject({
      handle: 'activation-user',
      emailVerifiedAt: expect.any(String),
    });

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.emailVerifiedAt).toBe(activation.body.emailVerifiedAt);

    const reused = await agent.post('/api/auth/activate').send({ token });
    expect(reused.status).toBe(400);
    expect(reused.body).toEqual({ error: 'invalid or expired activation token' });

    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const resend = await agent.post('/api/auth/resend-activation');
      expect(resend.status).toBe(200);
      expect(resend.body).toMatchObject({
        handle: 'activation-user',
        emailVerifiedAt: activation.body.emailVerifiedAt,
      });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('rejects invalid and expired tokens with a clear error', async () => {
    const agent = request.agent(app);
    const { registration, token } = await registerAndGetToken(agent, {
      handle: 'expired-user',
      email: 'expired-user@example.com',
      password: 'correct-horse',
    });
    await prisma.emailVerification.update({
      where: { tokenHash: hashVerificationToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const invalid = await agent.post('/api/auth/activate').send({ token: 'not-a-token' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: 'invalid or expired activation token' });

    const expired = await agent.post('/api/auth/activate').send({ token });
    expect(expired.status).toBe(400);
    expect(expired.body).toEqual({ error: 'invalid or expired activation token' });
    expect(await prisma.emailVerification.count({ where: { userId: registration.body.id } })).toBe(0);
  });

  it('resend invalidates the previous token', async () => {
    const agent = request.agent(app);
    const { token: firstToken } = await registerAndGetToken(agent, {
      handle: 'resend-user',
      email: 'resend-user@example.com',
      password: 'correct-horse',
    });

    const previousApiKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const resend = await agent.post('/api/auth/resend-activation');
      expect(resend.status).toBe(200);
      const throttled = await agent.post('/api/auth/resend-activation');
      expect(throttled.status).toBe(429);
      expect(throttled.body).toMatchObject({
        error: 'activation resend throttled',
        retryAfterSeconds: expect.any(Number),
      });
      const activationLog = log.mock.calls
        .map(([message]) => String(message))
        .find((message) => message.includes('/activate?token='));
      expect(activationLog).toBeDefined();
      const secondToken = new URL(activationLog!.slice(activationLog!.indexOf('http')))
        .searchParams.get('token');
      expect(secondToken).toEqual(expect.any(String));

      const first = await agent.post('/api/auth/activate').send({ token: firstToken });
      expect(first.status).toBe(400);
      const second = await agent.post('/api/auth/activate').send({ token: secondToken });
      expect(second.status).toBe(200);
      expect(second.body.emailVerifiedAt).toEqual(expect.any(String));
    } finally {
      log.mockRestore();
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
    }
  });
});
