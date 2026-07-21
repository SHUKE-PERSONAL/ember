import { copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach } from 'vitest';
import { TEMPLATE_DB } from './paths.js';

// Per-file harness. Runs before the test module is imported, so DATABASE_URL is
// set before db.ts's module-level PrismaClient reads it, and SESSION_SECRET is
// present before createApp()'s guard runs. Each file gets an isolated copy of
// the migrated template; vitest's default per-file process isolation keeps the
// db.ts singleton bound to this file's DB.
process.env.SESSION_SECRET ??= 'test-secret';

const workerId = process.env.VITEST_WORKER_ID ?? '0';
const dbPath = path.join(tmpdir(), `ember-vitest-${process.pid}-${workerId}.db`);
copyFileSync(TEMPLATE_DB, dbPath);
process.env.DATABASE_URL = `file:${dbPath}`;

// Import after DATABASE_URL is set so the singleton binds this file's test DB.
const { prisma } = await import('../src/db.js');

beforeEach(async () => {
  await prisma.post.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dbPath, { force: true });
});
