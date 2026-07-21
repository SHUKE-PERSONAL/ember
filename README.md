# Ember

Monorepo skeleton: Vite + React (client) and Node + Express (server), TypeScript
throughout, SQLite via Prisma.

## Layout

```
client/   Vite + React + TS frontend
server/   Express + TS backend (run via tsx in dev)
```

## Prerequisites

- Node.js 20+
- npm 9+ (workspaces)

## Getting started

```bash
npm install
cp server/.env.example server/.env   # sets DATABASE_URL + PORT
npm run dev
```

`npm run dev` starts both services together:

- Client (Vite): http://localhost:5173
- Server (Express): http://localhost:3001

The Vite dev server proxies `/api/*` to Express, so the browser uses a single
origin.

## Endpoints

- `GET /api/health` → `{ "status": "ok" }`

## Checks

```bash
npm run typecheck   # tsc --noEmit across both workspaces
npm run lint        # eslint (flat config, typescript-eslint)
npm test            # vitest across workspaces (--if-present; server only)
```

CI (`.github/workflows/ci.yml`) runs these on every pull request and on push to
`main`, after generating the Prisma client.

## Database

Prisma is wired with a SQLite datasource and an empty schema
(`server/prisma/schema.prisma`). Real models arrive in a later change; generate
the client with `npx prisma generate` from `server/` once models exist.
