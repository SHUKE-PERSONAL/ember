import { PrismaClient } from '@prisma/client';

// Shared PrismaClient singleton. A single instance avoids exhausting the DB
// connection pool when tsx watch hot-reloads modules in dev.
export const prisma = new PrismaClient();
