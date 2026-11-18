# EnergyCRM

Внутрішня веб-платформа продажу електроенергії: клієнти, угоди у воронках, продукти, споживання (групи А/Б), постачальники, генерація та аналітика. Інтерфейс — українською, дизайн 1:1 з макетів (`design-ref/`), вимоги — `docs/requirements.md`.

**Стек:** Next.js 16 · React 19 · TypeScript · PostgreSQL · Prisma 7 · Vitest. Версії перевірені 18.11.2026.

## Запуск у Docker (рекомендовано)

```bash
cp .env.docker.example .env.docker      # задайте POSTGRES_PASSWORD
docker compose --env-file .env.docker up -d --build
```

Застосунок: http://localhost:3000 (порт — `APP_PORT`). При першому запуску контейнер сам створює схему БД, вмикає захист журналу дій і:
- `SEED_MODE=demo` — заповнює демо-даними з дизайну (1 248 клієнтів, 373 угоди, споживання);
- `SEED_MODE=prod` — створює лише акаунт адміна.

Резервні копії: `scripts/backup.sh` (cron), відновлення — у заголовку скрипта.

## Локальна розробка

```bash
npm ci
cp .env.example .env        # DATABASE_URL до локального PostgreSQL
npx prisma generate && npx prisma db push && psql "$DATABASE_URL" -f prisma/post-push.sql
npm run db:seed             # демо-дані
npm run dev                 # http://localhost:3000
npm test                    # юніт та інтеграційні тести (потрібна демо-БД)
```

## Вхід (демо-дані)

| Роль | Логін | Пароль |
|---|---|---|
| Адмін (власник) | `mp@learntoearn.global` | `EnergyCRM-2026!` |
| Користувач (менеджер) | `olena@energycrm.ua`, `denys@energycrm.ua`, `iryna@energycrm.ua` | `EnergyCRM-2026!` |
| Користувач, потрібна зміна пароля | `andrii@energycrm.ua` | `EnergyCRM-2026!` |
| Заблокований | `sofiia@energycrm.ua` | — |

**Перед використанням у бойовому режимі** запустіть із `SEED_MODE=prod` і одразу змініть пароль адміна (він має мати прапорець зміни пароля — задайте новий через «Змінити пароль»). Демо-паролі публічні.

## Гілки

- `main` — стабільна робоча гілка.
- `dev` — розробка й тестування; після перевірки зливається в `main`.

## Структура

```
src/app/(app)/…      сторінки: dashboard, funnels, deals, clients, products, settings
src/app/actions/     server actions (усі перевірки прав — на сервері)
src/server/          домен: auth, permissions, access (доступ на рівні запису), analytics, audit
prisma/              schema.prisma, seed.ts, post-push.sql (append-only журнал)
design-ref/          еталонні макети
docs/                вимоги, матриця прослідковуваності
tests/               unit + integration
```
