# syntax=docker/dockerfile:1
# Образ EnergyCRM (Next.js 16 + Prisma 7). Версії перевірено на Docker Hub 18.11.2026.
FROM node:26.13-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# схема потрібна лише для генерації клієнта; підключення до БД на збірці не виконується
RUN DATABASE_URL="postgresql://x@localhost:5432/x" npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 app
COPY --from=build --chown=app /app/package.json ./package.json
COPY --from=build --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/.next ./.next
COPY --from=build --chown=app /app/public ./public
COPY --from=build --chown=app /app/src/generated ./src/generated
COPY --from=build --chown=app /app/prisma ./prisma
COPY --from=build --chown=app /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=app /app/next.config.ts ./next.config.ts
COPY --from=build --chown=app /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npx", "next", "start"]
