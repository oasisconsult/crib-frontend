# ─── Base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ─── Dependencies ─────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# Use --prefer-offline and retry to handle flaky network in Docker
RUN npm install --prefer-offline --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-retries=5

# ─── Development ─────────────────────────────────────────────────────
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "run", "dev"]

# ─── Builder ─────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars must be available at build time — Next.js bakes them
# into the static bundle during 'next build'. Pass them as --build-arg
# in docker compose (see build.args in docker-compose.prod.shared.yml).
ARG NEXT_PUBLIC_LOGTO_ENDPOINT
ARG NEXT_PUBLIC_LOGTO_APP_ID
ARG NEXT_PUBLIC_LOGTO_API_RESOURCE
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MOCK_API=false
ARG NEXT_PUBLIC_MAILHOG_URL=""

ENV NEXT_PUBLIC_LOGTO_ENDPOINT=$NEXT_PUBLIC_LOGTO_ENDPOINT
ENV NEXT_PUBLIC_LOGTO_APP_ID=$NEXT_PUBLIC_LOGTO_APP_ID
ENV NEXT_PUBLIC_LOGTO_API_RESOURCE=$NEXT_PUBLIC_LOGTO_API_RESOURCE
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_MOCK_API=$NEXT_PUBLIC_MOCK_API
ENV NEXT_PUBLIC_MAILHOG_URL=$NEXT_PUBLIC_MAILHOG_URL

RUN npm run build

# ─── Production ──────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]