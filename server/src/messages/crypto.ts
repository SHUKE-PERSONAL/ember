import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function encryptionKey() {
  const configured = process.env.MESSAGE_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error(
      'MESSAGE_ENCRYPTION_KEY is not set — copy server/.env.example and configure the message key',
    );
  }

  // Hashing the configured secret gives AES-256 a fixed-size key while still
  // allowing the development template to use its ordinary placeholder style.
  return createHash('sha256').update(configured, 'utf8').digest();
}

export function assertMessageEncryptionKey() {
  encryptionKey();
}

export function encryptMessage(text: string) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const encryptedBody = Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64');

  return {
    encryptedBody,
    nonce: nonce.toString('base64'),
  };
}

export function decryptMessage(encryptedBody: string, nonce: string) {
  const payload = Buffer.from(encryptedBody, 'base64');
  if (payload.length < AUTH_TAG_BYTES) {
    throw new Error('invalid encrypted message');
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(nonce, 'base64'));
  decipher.setAuthTag(payload.subarray(-AUTH_TAG_BYTES));
  return Buffer.concat([
    decipher.update(payload.subarray(0, -AUTH_TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
