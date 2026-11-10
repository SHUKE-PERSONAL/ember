import { afterEach, describe, expect, it, vi } from 'vitest';

const resendSend = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: vi.fn(function MockResend() {
    return { emails: { send: resendSend } };
  }),
}));

import request from 'supertest';
import { prisma } from '../db.js';
import { createApp } from '../index.js';
import { hashVerificationToken } from './verification.js';

const app = createApp();

afterEach(() => {
  resendSend.mockReset();
  vi.restoreAllMocks();
});

async function registerAndGetToken(agent: ReturnType<typeof request.agent>, data: Record<string, string>) {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.RESEND_API_KEY;
  process.env.NODE_ENV = 'test';
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    const registration = await agent.post('/api/auth/register').send(data);
    if (registration.body.emailDelivery !== 'logged') {
      throw new Error('registration did not report logged delivery');
    }
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
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
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

  it('fails closed for missing or blank production mail keys while keeping the token', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';

    try {
      for (const [suffix, apiKey] of [['missing', undefined], ['blank', '   ']] as const) {
        if (apiKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = apiKey;
        const email = `production-${suffix}@example.com`;
        const response = await request(app).post('/api/auth/register').send({
          handle: `production-${suffix}`,
          email,
          password: 'correct-horse',
        });

        expect(response.status).toBe(503);
        expect(response.body).toEqual({ error: 'activation email unavailable' });
        expect(response.text).not.toContain('/activate?token=');
        const user = await prisma.user.findUniqueOrThrow({
          where: { email },
          select: { id: true },
        });
        expect(await prisma.emailVerification.count({ where: { userId: user.id } })).toBe(1);
      }
      expect(log).not.toHaveBeenCalled();
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('returns sent delivery for an accepted Resend request', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.RESEND_API_KEY = 'resend-test-key';
    process.env.NODE_ENV = 'test';
    resendSend.mockResolvedValueOnce({ data: { id: 'email-id' }, error: null });

    try {
      const response = await request(app).post('/api/auth/register').send({
        handle: 'provider-success-user',
        email: 'provider-success-user@example.com',
        password: 'correct-horse',
      });

      expect(response.status).toBe(201);
      expect(response.body.emailDelivery).toBe('sent');
      expect(response.body).not.toHaveProperty('token');
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('returns the safe 503 response when the provider rejects registration mail', async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.RESEND_API_KEY = 'resend-test-key';
    process.env.NODE_ENV = 'test';
    resendSend.mockRejectedValueOnce(new Error('provider request failed'));

    try {
      const response = await request(app).post('/api/auth/register').send({
        handle: 'provider-failure-user',
        email: 'provider-failure-user@example.com',
        password: 'correct-horse',
      });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'activation email unavailable' });
      expect(response.text).not.toContain('/activate?token=');
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'provider-failure-user@example.com' },
        select: { id: true },
      });
      expect(await prisma.emailVerification.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});

describe('POST /api/auth/change-password', () => {
  it('requires an authenticated session', async () => {
    const response = await request(app).post('/api/auth/change-password').send({
      currentPassword: 'correct-horse',
      newPassword: 'new-correct-horse',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'not authenticated' });
  });

  it('rejects missing or blank values without changing the stored hash', async () => {
    const agent = request.agent(app);
    const registration = await agent.post('/api/auth/register').send({
      handle: 'change-invalid-user',
      email: 'change-invalid-user@example.com',
      password: 'correct-horse',
    });
    expect(registration.status).toBe(201);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: registration.body.id },
      select: { passwordHash: true },
    });
    const invalidBodies = [
      { newPassword: 'new-correct-horse' },
      { currentPassword: 'correct-horse' },
      { currentPassword: ' ', newPassword: 'new-correct-horse' },
      { currentPassword: 'correct-horse', newPassword: ' ' },
    ];

    for (const body of invalidBodies) {
      const response = await agent.post('/api/auth/change-password').send(body);
      expect(response.status).toBe(400);
    }

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: registration.body.id },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('rejects a wrong current password without changing the stored hash', async () => {
    const agent = request.agent(app);
    const registration = await agent.post('/api/auth/register').send({
      handle: 'change-wrong-user',
      email: 'change-wrong-user@example.com',
      password: 'correct-horse',
    });
    expect(registration.status).toBe(201);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: registration.body.id },
      select: { passwordHash: true },
    });
    const response = await agent.post('/api/auth/change-password').send({
      currentPassword: 'wrong-horse',
      newPassword: 'new-correct-horse',
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'invalid current password' });
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: registration.body.id },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('changes only the authenticated user password and keeps the session usable', async () => {
    const agent = request.agent(app);
    const otherAgent = request.agent(app);
    const registration = await agent.post('/api/auth/register').send({
      handle: 'change-success-user',
      email: 'change-success-user@example.com',
      password: 'correct-horse',
    });
    const otherRegistration = await otherAgent.post('/api/auth/register').send({
      handle: 'change-other-user',
      email: 'change-other-user@example.com',
      password: 'other-correct-horse',
    });
    expect(registration.status).toBe(201);
    expect(otherRegistration.status).toBe(201);

    const before = await prisma.user.findMany({
      where: { id: { in: [registration.body.id, otherRegistration.body.id] } },
      select: { id: true, passwordHash: true },
    });
    const beforeById = new Map(before.map((user) => [user.id, user.passwordHash]));

    const response = await agent.post('/api/auth/change-password').send({
      currentPassword: 'correct-horse',
      newPassword: 'new-correct-horse',
    });
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(response.body.passwordHash).toBeUndefined();

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ handle: 'change-success-user' });
    expect(me.body.password).toBeUndefined();
    expect(me.body.passwordHash).toBeUndefined();

    const after = await prisma.user.findMany({
      where: { id: { in: [registration.body.id, otherRegistration.body.id] } },
      select: { id: true, passwordHash: true },
    });
    const afterById = new Map(after.map((user) => [user.id, user.passwordHash]));
    expect(afterById.get(registration.body.id)).not.toBe(beforeById.get(registration.body.id));
    expect(afterById.get(otherRegistration.body.id)).toBe(beforeById.get(otherRegistration.body.id));

    const oldLogin = await request(app).post('/api/auth/login').send({
      identifier: 'change-success-user',
      password: 'correct-horse',
    });
    expect(oldLogin.status).toBe(401);
    expect(oldLogin.body.passwordHash).toBeUndefined();

    const newLogin = await request(app).post('/api/auth/login').send({
      identifier: 'change-success-user',
      password: 'new-correct-horse',
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.password).toBeUndefined();
    expect(newLogin.body.passwordHash).toBeUndefined();
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
        emailDelivery: 'not-needed',
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
      expect(resend.body.emailDelivery).toBe('logged');
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

  it('returns 503 for unavailable resend mail, keeps the token, and allows an immediate retry', async () => {
    const agent = request.agent(app);
    const { registration } = await registerAndGetToken(agent, {
      handle: 'resend-failure-user',
      email: 'resend-failure-user@example.com',
      password: 'correct-horse',
    });
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = 'production';

    try {
      const failed = await agent.post('/api/auth/resend-activation');
      expect(failed.status).toBe(503);
      expect(failed.body).toEqual({ error: 'activation email unavailable' });
      expect(failed.text).not.toContain('/activate?token=');
      expect(await prisma.emailVerification.count({ where: { userId: registration.body.id } }))
        .toBe(1);

      process.env.RESEND_API_KEY = 'resend-test-key';
      process.env.NODE_ENV = 'test';
      resendSend.mockRejectedValueOnce(new Error('provider request failed'));
      const rejected = await agent.post('/api/auth/resend-activation');
      expect(rejected.status).toBe(503);
      expect(rejected.body).toEqual({ error: 'activation email unavailable' });
      expect(rejected.text).not.toContain('/activate?token=');
      expect(await prisma.emailVerification.count({ where: { userId: registration.body.id } }))
        .toBe(1);

      resendSend.mockResolvedValueOnce({ data: { id: 'retry-email-id' }, error: null });
      const retried = await agent.post('/api/auth/resend-activation');
      expect(retried.status).toBe(200);
      expect(retried.body).not.toHaveProperty('token');
      expect(retried.body.emailDelivery).toBe('sent');
      expect(await prisma.emailVerification.count({ where: { userId: registration.body.id } }))
        .toBe(1);
    } finally {
      if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousApiKey;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
