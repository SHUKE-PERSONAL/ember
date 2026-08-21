import { Prisma } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { publicAuthor } from '../auth/publicUser.js';
import { requireAuth } from '../auth/requireAuth.js';
import { prisma } from '../db.js';
import { asyncHandler } from '../util/asyncHandler.js';
import { decryptMessage, encryptMessage } from './crypto.js';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

const authorSelect = { sender: { select: publicAuthor }, recipient: { select: publicAuthor } } as const;
const metadataSelect = {
  id: true,
  senderId: true,
  recipientId: true,
  createdAt: true,
  readAt: true,
  ...authorSelect,
} as const;
const fullSelect = {
  ...metadataSelect,
  encryptedBody: true,
  nonce: true,
} as const;

type MessageMetadata = Prisma.MessageGetPayload<{ select: typeof metadataSelect }>;
type MessageRow = Prisma.MessageGetPayload<{ select: typeof fullSelect }>;

function conversationKey(senderId: string, recipientId: string) {
  return [senderId, recipientId].sort().join(':');
}

function serializeMessage(message: MessageRow, readAt = message.readAt) {
  return {
    id: message.id,
    sender: message.sender,
    recipient: message.recipient,
    text: decryptMessage(message.encryptedBody, message.nonce),
    createdAt: message.createdAt,
    readAt,
  };
}

function serializeSummary(rows: MessageMetadata[], viewerId: string) {
  const summaries = new Map<string, {
    participant: MessageMetadata['sender'];
    lastMessage: Pick<MessageMetadata, 'id' | 'senderId' | 'recipientId' | 'createdAt' | 'readAt'>;
    unreadCount: number;
  }>();

  for (const row of rows) {
    const key = conversationKey(row.senderId, row.recipientId);
    const participant = row.senderId === viewerId ? row.recipient : row.sender;
    const current = summaries.get(key);
    if (!current) {
      summaries.set(key, {
        participant,
        lastMessage: row,
        unreadCount: row.recipientId === viewerId && row.readAt === null ? 1 : 0,
      });
      continue;
    }

    if (row.recipientId === viewerId && row.readAt === null) current.unreadCount += 1;
  }

  return [...summaries.values()];
}

function parseMessageText(req: Request, res: Response) {
  const { text, body } = req.body ?? {};
  const value = typeof text === 'string' ? text : body;
  if (typeof value !== 'string' || value.trim().length === 0) {
    res.status(400).json({ error: 'text is required' });
    return null;
  }
  return value;
}

messagesRouter.get('/messages', asyncHandler(async (req: Request, res: Response) => {
  const viewerId = req.session.userId!;
  const rows = await prisma.message.findMany({
    where: { OR: [{ senderId: viewerId }, { recipientId: viewerId }] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: metadataSelect,
  });

  return res.json({ conversations: serializeSummary(rows, viewerId) });
}));

messagesRouter.get('/messages/:handle', asyncHandler(async (req: Request, res: Response) => {
  const viewerId = req.session.userId!;
  const participant = await prisma.user.findUnique({
    where: { handle: req.params.handle },
    select: publicAuthor,
  });
  if (!participant || participant.id === viewerId) {
    return res.status(404).json({ error: 'conversation not found' });
  }

  const rows = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: viewerId, recipientId: participant.id },
        { senderId: participant.id, recipientId: viewerId },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: fullSelect,
  });
  if (rows.length === 0) {
    return res.status(404).json({ error: 'conversation not found' });
  }
  const decrypted = rows.map((row) => serializeMessage(row));
  const now = new Date();
  const unreadIds = rows
    .filter((row) => row.recipientId === viewerId && row.readAt === null)
    .map((row) => row.id);
  if (unreadIds.length > 0) {
    await prisma.message.updateMany({ where: { id: { in: unreadIds } }, data: { readAt: now } });
  }

  return res.json({
    participant,
    messages: decrypted.map((message) =>
      message.recipient.id === viewerId && message.readAt === null
        ? { ...message, readAt: now }
        : message,
    ),
  });
}));

messagesRouter.post('/messages/:handle', asyncHandler(async (req: Request, res: Response) => {
  const text = parseMessageText(req, res);
  if (text === null) return;

  const viewerId = req.session.userId!;
  const recipient = await prisma.user.findUnique({
    where: { handle: req.params.handle },
    select: publicAuthor,
  });
  if (!recipient || recipient.id === viewerId) {
    return res.status(404).json({ error: 'user not found' });
  }

  const encrypted = encryptMessage(text);
  const message = await prisma.message.create({
    data: {
      senderId: viewerId,
      recipientId: recipient.id,
      ...encrypted,
    },
    select: fullSelect,
  });

  return res.status(201).json(serializeMessage(message));
}));
