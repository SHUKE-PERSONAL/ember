FROM node:20-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY server/prisma server/prisma

RUN npm ci
RUN npm exec -w server -- prisma generate

FROM dependencies AS build

COPY tsconfig.base.json eslint.config.js ./
COPY client client
COPY server server

RUN npm run build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Keep the generated Prisma client and Prisma CLI used by deploy migrations.
# The image is built natively on sydney2's arm64 Docker host.
COPY --from=dependencies /app/node_modules node_modules
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "server/dist/index.js"]
