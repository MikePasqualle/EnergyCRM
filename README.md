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

## AI-агент і Telegram-бот

Панель праворуч на кожному екрані (кнопка «Запитати AI») і той самий агент у Telegram. Працює через Claude API з інструментами, що читають CRM із правами користувача.

- **Чат** — лише читання: пошук клієнтів і угод, аналітика, звіт менеджерів.
- **Дії** — агент перевіряє флоу введення, повідомляє, чого бракує (менеджер, воронка, продукт, обсяг…), і готує зміни (клієнт, угода, етап, запис комунікації). Нічого не змінюється, доки ви не натиснете «Підтвердити»; зміни йдуть у журнал дій.
- **Telegram** — Налаштування → «AI-агент і Telegram»: токен від @BotFather і один дозволений Telegram ID; усі інші акаунти ігноруються. Команди: `/act`, `/chat`, `/new`. Працює через long polling — публічна адреса не потрібна.
- **Голос** — голосове з Telegram розпізнається (OpenAI) і виконується як текст; бот показує розпізнане. В Anthropic власного розпізнавання мовлення немає.

Змінні середовища (`.env.docker`): `ANTHROPIC_API_KEY` (обовʼязково), `OPENAI_API_KEY` (лише для голосу), `APP_SECRET` (шифрує токен Telegram у БД: `openssl rand -hex 32`), `PUBLIC_URL` (посилання «Відкрити» в Telegram), `ANTHROPIC_MODEL`/`TRANSCRIBE_MODEL` (за потреби). Модель і глибину міркування обирає адміністратор у налаштуваннях (типово Claude Opus 5.5).
Бот запускається в процесі застосунку, тому запускайте **один** екземпляр контейнера.

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
