import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './index.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const previousNodeEnv = process.env.NODE_ENV;

// Production serving depends on the real Vite output path. Build it here so
// this test also works from a clean checkout without committing dist/.
execFileSync('npm', ['run', 'build'], { cwd: repositoryRoot, stdio: 'inherit' });

process.env.NODE_ENV = 'production';
const app = createApp();
app.set('trust proxy', 1);

afterAll(() => {
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

describe('production SPA serving', () => {
  it('serves the built SPA for the root and client-side routes', async () => {
    const root = await request(app).get('/');
    const clientRoute = await request(app).get('/timeline');

    expect(root.status).toBe(200);
    expect(root.type).toBe('text/html');
    expect(root.text).toContain('<div id="root"></div>');
    expect(clientRoute.status).toBe(200);
    expect(clientRoute.text).toContain('<div id="root"></div>');
  });

  it('keeps API routes ahead of the SPA fallback', async () => {
    const health = await request(app).get('/api/health');
    const register = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-Proto', 'https')
      .send({
        handle: 'production-api-test',
        email: 'production-api-test@example.com',
        password: 'correct-horse',
      });
    expect(register.status).toBe(201);
    const sessionCookie = register.headers['set-cookie']?.[0]?.split(';', 1)[0];
    expect(sessionCookie).toBeDefined();
    const unknownApiRoute = await request(app)
      .get('/api/does-not-exist')
      // Supertest uses HTTP while production sessions set Secure cookies, so
      // forward the valid cookie explicitly for this authenticated 404 check.
      .set('Cookie', sessionCookie as string)
      .set('X-Forwarded-Proto', 'https');

    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
    expect(unknownApiRoute.status).toBe(404);
  });
});
