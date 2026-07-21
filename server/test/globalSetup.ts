import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { TEMPLATE_DB } from './paths.js';

// Build one migrated template DB before the suite. Per-file setup copies it, so
// prisma migrate runs a single time regardless of how many test files exist.
export default function setup() {
  rmSync(TEMPLATE_DB, { force: true });
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: `file:${TEMPLATE_DB}` },
  });

  return () => {
    rmSync(TEMPLATE_DB, { force: true });
  };
}
