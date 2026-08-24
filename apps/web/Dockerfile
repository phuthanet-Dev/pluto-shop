# syntax=docker/dockerfile:1.7

FROM node:24.18.0-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci && mkdir -p /app/apps/web/node_modules

FROM base AS builder
ARG INTERNAL_API_URL=http://localhost:8080
ENV INTERNAL_API_URL=${INTERNAL_API_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM node:24.18.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=12 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${PORT}/th" || exit 1
CMD ["node", "apps/web/server.js"]
