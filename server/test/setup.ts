import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach } from 'vitest';

const DEFAULT_DATABASE_URL = 'postgresql://ember:ember@localhost:5432/ember?schema=public';
const baseDatabaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const workerId = process.env.VITEST_WORKER_ID ?? '0';
const schemaName = `test_${process.pid}_${workerId}_${randomUUID().replaceAll('-', '')}`;
const schemaUrl = new URL(baseDatabaseUrl);
schemaUrl.searchParams.set('schema', schemaName);
const serverRoot = fileURLToPath(new URL('..', import.meta.url));

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
await admin.$executeRawUnsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
await admin.$disconnect();

// Run migrations per schema so every test file has a fresh PostgreSQL schema.
// The schema URL is set before db.ts is imported, binding the singleton to the
// isolated test database rather than the shared development schema.
execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: serverRoot,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: schemaUrl.toString() },
});

process.env.DATABASE_URL = schemaUrl.toString();
process.env.SESSION_SECRET ??= 'test-secret';

const { prisma } = await import('../src/db.js');

beforeEach(async () => {
  await prisma.like.deleteMany();
  await prisma.post.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();

  const cleanup = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
  await cleanup.$executeRawUnsafe(`DROP SCHEMA ${quoteIdentifier(schemaName)} CASCADE`);
  await cleanup.$disconnect();
});
