import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../db.js';
import { createApp } from '../index.js';
import { decryptMessage } from './crypto.js';

const app = createApp();

async function register(handle: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    handle,
    email: `${handle}@example.com`,
    password: 'correct-horse',
  });
  expect(response.status).toBe(201);
  return agent;
}

describe('message encryption and access', () => {
  it('requires authentication and the encryption key at startup', async () => {
    const unauthenticated = await request(app).get('/api/messages');
    expect(unauthenticated.status).toBe(401);

    const previousKey = process.env.MESSAGE_ENCRYPTION_KEY;
    delete process.env.MESSAGE_ENCRYPTION_KEY;
    try {
      expect(() => createApp()).toThrow('MESSAGE_ENCRYPTION_KEY is not set');
    } finally {
      if (previousKey === undefined) {
        delete process.env.MESSAGE_ENCRYPTION_KEY;
      } else {
        process.env.MESSAGE_ENCRYPTION_KEY = previousKey;
      }
    }
  });

  it('stores ciphertext, decrypts a thread, and tracks unread messages', async () => {
    const sender = await register('message-sender');
    const recipient = await register('message-recipient');
    const plaintext = 'this should never appear in the database';

    const sent = await sender.post('/api/messages/message-recipient').send({ text: plaintext });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      text: plaintext,
      sender: { handle: 'message-sender' },
      recipient: { handle: 'message-recipient' },
    });

    const row = await prisma.message.findUnique({ where: { id: sent.body.id } });
    expect(row).not.toBeNull();
    expect(row?.encryptedBody).not.toContain(plaintext);
    expect(row?.nonce).not.toContain(plaintext);
    expect(decryptMessage(row!.encryptedBody, row!.nonce)).toBe(plaintext);

    const unread = await recipient.get('/api/messages');
    expect(unread.status).toBe(200);
    expect(unread.body.conversations).toMatchObject([
      {
        participant: { handle: 'message-sender' },
        unreadCount: 1,
        lastMessage: { senderId: row!.senderId, recipientId: row!.recipientId },
      },
    ]);
    expect(unread.body.conversations[0].lastMessage).not.toHaveProperty('encryptedBody');
    expect(unread.body.conversations[0].lastMessage).not.toHaveProperty('text');

    const thread = await recipient.get('/api/messages/message-sender');
    expect(thread.status).toBe(200);
    expect(thread.body.participant).toMatchObject({ handle: 'message-sender' });
    expect(thread.body.messages).toMatchObject([{ text: plaintext, readAt: expect.any(String) }]);

    const readRow = await prisma.message.findUnique({ where: { id: sent.body.id } });
    expect(readRow?.readAt).not.toBeNull();
    const read = await recipient.get('/api/messages');
    expect(read.body.conversations[0].unreadCount).toBe(0);
  });

  it('does not expose a conversation to a non-participant', async () => {
    const sender = await register('message-owner');
    await register('message-other');
    const outsider = await register('message-outsider');

    const sent = await sender.post('/api/messages/message-other').send({ text: 'private' });
    expect(sent.status).toBe(201);

    const forbiddenThread = await outsider.get('/api/messages/message-owner');
    expect(forbiddenThread.status).toBe(404);
    const missingThread = await outsider.get('/api/messages/message-other');
    expect(missingThread.status).toBe(404);
  });

  it('validates message text and rejects self-messages', async () => {
    const agent = await register('message-validator');

    const missingText = await agent.post('/api/messages/message-validator').send({ text: '  ' });
    expect(missingText.status).toBe(400);

    const selfMessage = await agent.post('/api/messages/message-validator').send({ text: 'self' });
    expect(selfMessage.status).toBe(404);
  });
});
