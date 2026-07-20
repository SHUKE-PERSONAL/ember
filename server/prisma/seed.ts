import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password.js';

const prisma = new PrismaClient();

async function main() {
  const password = await hashPassword('password123');

  const usersData = [
    { handle: 'ada', displayName: 'Ada Lovelace', email: 'ada@ember.dev', bio: 'First programmer.' },
    { handle: 'linus', displayName: 'Linus', email: 'linus@ember.dev', bio: 'Just for fun.' },
    { handle: 'grace', displayName: 'Grace Hopper', email: 'grace@ember.dev', bio: 'Compiler pioneer.' },
  ];

  const users = [];
  for (const u of usersData) {
    users.push(
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash: password },
      }),
    );
  }
  const [ada, linus, grace] = users;

  // Follows: ada <-> linus, grace -> ada.
  const follows = [
    { followerId: ada.id, followingId: linus.id },
    { followerId: linus.id, followingId: ada.id },
    { followerId: grace.id, followingId: ada.id },
  ];
  for (const f of follows) {
    await prisma.follow.upsert({
      where: { followerId_followingId: f },
      update: {},
      create: f,
    });
  }

  // A few posts, including a reply.
  const posts = [
    { author: ada, text: 'Hello, Ember. 你好，世界 🔥' },
    { author: linus, text: 'Talk is cheap. Show me the code.' },
    { author: grace, text: 'The most dangerous phrase is "we have always done it this way."' },
  ];
  for (const p of posts) {
    await prisma.post.create({ data: { authorId: p.author.id, text: p.text } });
  }

  const adaPost = await prisma.post.findFirst({ where: { authorId: ada.id } });
  if (adaPost) {
    await prisma.post.create({
      data: { authorId: linus.id, text: '@ada welcome aboard!', replyToId: adaPost.id },
    });
  }

  console.log(`Seeded ${users.length} users, ${follows.length} follows, ${posts.length + 1} posts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
