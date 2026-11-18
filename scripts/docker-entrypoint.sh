#!/bin/sh
set -e
# 1. чекаємо на PostgreSQL
until pg_isready -d "$DATABASE_URL" -q; do echo "Очікуємо PostgreSQL…"; sleep 2; done
# 2. схема + захист журналу дій (append-only) + pg_trgm
npx prisma db push --skip-generate
psql "$DATABASE_URL" -q -f prisma/post-push.sql
# 3. перший запуск: демо-дані або лише акаунт адміна
if [ "$(psql "$DATABASE_URL" -Atc 'SELECT count(*) FROM "User"')" = "0" ]; then
  if [ "$SEED_MODE" = "demo" ]; then echo "Заповнюємо демо-даними…"; npx tsx prisma/seed.ts;
  else echo "Створюємо лише акаунт адміна…"; SEED_MODE=prod npx tsx prisma/seed.ts; fi
fi
exec "$@"
