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

Build the client and server, then run only the compiled Express server:

```bash
npm run build
NODE_ENV=production npm run start -w server
```

The production server serves `client/dist` and handles client-side routes on the
same origin as the `/api/*` routes. Because production sessions use secure
cookies, serve the application over HTTPS.

### Sydney2 deployment

The production deployment runs the app and PostgreSQL in Docker Compose on
`arm/sydney2` (`152.69.173.242`). The app binds to `127.0.0.1:3001`; nginx
proxies the hostname to that private port, and Cloudflare provides the public
HTTPS edge.

One-time host setup:

1. Install Docker Engine and the Compose plugin on sydney2, then create
   `/var/www/ember`.
2. Copy `.env.production.example` to `/var/www/ember/.env.production` and set
   unique URL-safe values (for example, `openssl rand -hex 32`) for
   `POSTGRES_PASSWORD` and `SESSION_SECRET`, using the same password in
   `DATABASE_URL`. Keep
   `DATABASE_URL` pointed at the Compose service name `postgres`; this file is
   host-only, should be mode `600`, and is preserved by deployments.
3. Create the nginx site from
   [`deploy/nginx/bbs.shukelabs.com.conf`](deploy/nginx/bbs.shukelabs.com.conf),
   enable it, and reload nginx after `nginx -t` succeeds. For example:

   ```bash
   sudo cp /var/www/ember/deploy/nginx/bbs.shukelabs.com.conf \
     /etc/nginx/sites-available/bbs.shukelabs.com
   sudo ln -s /etc/nginx/sites-available/bbs.shukelabs.com \
     /etc/nginx/sites-enabled/bbs.shukelabs.com
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. In the `shukelabs.com` Cloudflare zone, create an A record for `bbs` to
   `152.69.173.242` with the proxy enabled. With the supplied plain-HTTP nginx
   origin, use Cloudflare's Flexible SSL mode; the nginx template preserves
   Cloudflare's `X-Forwarded-Proto: https` header so the browser-facing
   connection remains HTTPS and the session cookie remains secure.
5. Add these GitHub Actions repository secrets: `SSH_HOST`, `SSH_USER`, and
   `SSH_PRIVATE_KEY`. The deploy workflow uses them to ship the checked-out
   commit, build on the native ARM host, migrate, restart, and health-check.

Pushes to `main` and manual runs of `.github/workflows/deploy.yml` deploy the
checked-out repository commit. To roll back, manually run the same workflow
with a known-good commit or rerun that commit's workflow; the PostgreSQL named
volume is not removed by a deploy.

Verify the public edge after the first deployment:

```bash
curl --fail --silent https://bbs.shukelabs.com/api/health
# Open https://bbs.shukelabs.com, register, compose a post, and confirm it is
# visible on the timeline. Restart the app on sydney2 and confirm the same post
# is still visible after the check.
```

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
