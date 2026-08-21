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
terminates TLS with a Certbot certificate and proxies the hostname to that
private port, while Cloudflare proxies the public HTTPS connection in Full
SSL mode.

One-time host setup:

1. Install Docker Engine and the Compose plugin on sydney2, then create
   `/var/www/ember`.
2. Copy `.env.production.example` to `/var/www/ember/.env.production` and set
   unique URL-safe values (for example, `openssl rand -hex 32`) for
   `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `MESSAGE_ENCRYPTION_KEY`, using
   the same password in
   `DATABASE_URL`. Keep
   `DATABASE_URL` pointed at the Compose service name `postgres`; this file is
   host-only, should be mode `600`, and is preserved by deployments.
3. After the proxied DNS A record for `bbs.shukelabs.com` resolves, bootstrap
   the nginx certificate. Sydney2 keeps host configs in `/etc/nginx/conf.d`.
   Install a temporary port-80 server block for the hostname, then request the
   certificate:

   ```bash
   sudo tee /etc/nginx/conf.d/bbs.shukelabs.com.conf >/dev/null <<'NGINX'
   server {
       listen 80;
       listen [::]:80;
       server_name bbs.shukelabs.com;
       location / { return 404; }
   }
   NGINX
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot certonly --nginx -d bbs.shukelabs.com
   sudo cp /var/www/ember/deploy/nginx/bbs.shukelabs.com.conf \
     /etc/nginx/conf.d/bbs.shukelabs.com.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. In the `shukelabs.com` Cloudflare zone, create an A record for `bbs` to
   `152.69.173.242` with the proxy enabled. Keep the zone SSL mode at Full;
   nginx terminates TLS with the Certbot certificate, and the template
   preserves Cloudflare's `X-Forwarded-Proto: https` header so the session
   cookie remains secure.
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
- `GET /api/users/:handle` → public profile, follower/following counts, and viewer follow state
- `GET /api/users/:handle/posts` → cursor-paginated posts authored by that user
- `POST /api/users/:handle/follow` / `DELETE /api/users/:handle/follow` → follow or unfollow a user
- `GET /api/topics/:tag/posts` → cursor-paginated posts containing a topic tag, newest first
- `GET /api/search?q=` → matching posts and users for a search query
- `GET /api/posts/:id` → a post and its direct replies
- `POST /api/posts/:id/reply` → create a reply
- `POST /api/posts/:id/like` / `DELETE /api/posts/:id/like` → like or unlike a post
- `POST /api/posts/:id/repost` / `DELETE /api/posts/:id/repost` → repost or unrepost a post
- `GET /api/messages` → conversation summaries with participant, last-message metadata, and unread count
- `GET /api/messages/:handle` → the authenticated user's decrypted thread with another user
- `POST /api/messages/:handle` → send an encrypted message to another user by handle (`{ "text": "..." }`)

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
