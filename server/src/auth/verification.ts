import { createHash, randomBytes } from 'node:crypto';

export const ACTIVATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function createVerificationToken() {
  return randomBytes(32).toString('hex');
}

export function hashVerificationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
