# syntax=docker/dockerfile:1
#
# Astro 5 SSR frontend (node standalone adapter). Context: ./frontend.
# Multi-stage: installs deps and builds; the runtime only carries dist/ and production deps.
# pnpm 10 (not 11): pnpm 11 requires Node >= 22 and this image uses Node 20; the v9 lockfile is compatible.

ARG NODE_VERSION=20
ARG PNPM_VERSION=10.20.0

# --------------------------------------------------------------------------- deps + build
FROM node:${NODE_VERSION}-alpine AS build
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
# PUBLIC_API_URL is NOT set: the browser uses relative paths (/api) and the proxy (Caddy)
# forwards them to the backend. Built with Astro telemetry turned off.
ENV ASTRO_TELEMETRY_DISABLED=1
RUN pnpm build

# --------------------------------------------------------------------------- production deps
FROM node:${NODE_VERSION}-alpine AS prod-deps
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

# --------------------------------------------------------------------------- runtime
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    ASTRO_TELEMETRY_DISABLED=1 \
    API_INTERNAL_URL=http://backend:8000

# The "node" user of the official image is uid 1000; a dedicated one with uid 10001 is created.
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app -h /app -s /sbin/nologin app
WORKDIR /app

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./

USER app
EXPOSE 4321

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD ["node", "-e", "require('net').connect(4321,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"]

CMD ["node", "dist/server/entry.mjs"]
