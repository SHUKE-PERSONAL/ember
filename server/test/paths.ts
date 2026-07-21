import { tmpdir } from 'node:os';
import path from 'node:path';

// Single migrated SQLite database built once by globalSetup; each test file
// copies it to its own throwaway DB (see setup.ts). Fixed name so globalSetup
// (parent process) and setup.ts (workers) resolve the same file without needing
// env to cross the process boundary.
export const TEMPLATE_DB = path.join(tmpdir(), 'ember-vitest-template.db');
