# Ember

Monorepo skeleton: Vite + React (client) and Node + Express (server), TypeScript
throughout, PostgreSQL via Prisma.

## Layout

```
client/   Vite + React + TS frontend
server/   Express + TS backend (run via tsx in dev)
```

## Prerequisites

- Node.js 20+
- npm 9+ (workspaces)
- Docker with Compose

## Getting started

```bash
npm install
docker compose up -d --wait postgres
cp server/.env.example server/.env   # sets DATABASE_URL + PORT
npm exec -w server -- prisma migrate deploy
npm run dev
```

`npm run dev` starts both services together:

- Client (Vite): http://localhost:5173
- Server (Express): http://localhost:3001

The Vite dev server proxies `/api/*` to Express, so the browser uses a single
origin.

## Production

Build the client and run only the Express server:

```bash
npm run build
NODE_ENV=production npm run dev -w server
```

The production server serves `client/dist` and handles client-side routes on the
same origin as the `/api/*` routes. Because production sessions use secure
cookies, serve the application over HTTPS.

## Endpoints

- `GET /api/health` → `{ "status": "ok" }`

## Checks

```bash
npm run typecheck   # tsc --noEmit across both workspaces
npm run lint        # eslint (flat config, typescript-eslint)
npm test            # vitest against isolated PostgreSQL schemas
```

CI (`.github/workflows/ci.yml`) runs these on every pull request and on push to
`main`, using a PostgreSQL service after generating the Prisma client, applying
migrations, and running the seed twice.

## Database

The local PostgreSQL service is defined in `docker-compose.yml`. Start it with
`docker compose up -d --wait postgres`, then apply migrations with
`npm exec -w server -- prisma migrate deploy`. The idempotent development seed
is available with `npm run seed -w server`.

The test harness creates and migrates a disposable PostgreSQL schema for each
test file, so `npm test` does not modify the shared development data.
