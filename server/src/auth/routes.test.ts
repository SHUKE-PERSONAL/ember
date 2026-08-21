import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';

const app = createApp();

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
