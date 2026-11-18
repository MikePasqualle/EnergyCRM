# Матриця прослідковуваності: вимоги → реалізація → перевірка

| Вимога | Екран / код | Перевірка |
|---|---|---|
| FR-1.1–1.5 вхід, адмін створює користувачів, блок/скидання/роль, зміна тимчасового пароля, автовихід | `/login`, `/change-password`, `settings/users`, `IdleGuard`, `server/auth.ts` | `rules.test.ts` (політика пароля) |
| FR-2.1–2.5 аналітика, період, воронка, менеджер | `/dashboard`, `server/analytics.ts` | `security.test.ts` (числа дашборда = макет) |
| FR-3.1–3.7 воронки, канбан, історія, етапи, типи, картка угоди, створення | `/funnels`, `/funnels/settings`, `/deals/[id]`, `actions/deals.ts`, `actions/funnels.ts` | ручна перевірка + `moveDeal` інваріанти |
| FR-4.1–4.8 реєстр, форма, дублі, вкладки картки, спілкування, статус | `/clients`, `ClientForm`, `/clients/[id]` | `rules.test.ts` (нормалізація), duplicates API |
| FR-5.1–5.4 продукти, заморожена ціна, архів | `/products`, `Deal.priceSnapshot` | `rules.test.ts` (сума угоди) |
| FR-6.1–6.4 користувачі/ролі, довідники, валюта/одиниці/пояс, журнал | `settings/users`, `settings/dictionaries` | `security.test.ts` (append-only) |
| FR-7.1–7.10 реєстр, перезакріплення, фільтри, відпрацьоване, налаштування споживача, графіки, частки 100%, генерація | `RegistryTable`, `SystemEditor`, `usage`, `dashboard/managers`, `lib/shares.ts` | `rules.test.ts` (частки), `security.test.ts` |
| NFR-1 паролі: хеш argon2id, ≥12, HTTPS-заголовки | `auth.ts`, `next.config.ts` | `rules.test.ts` |
| NFR-2/10 права й доступ на сервері | `server/access.ts`, `assertCan` у кожній дії | `security.test.ts` |
| NFR-3 5 спроб → блок | `auth.ts` login | — |
| NFR-4 анонімізація | `anonymizeClient` | — |
| NFR-5/12 журнал append-only, історія змін | `audit.ts`, `post-push.sql` | `security.test.ts` |
| NFR-7 резервні копії | `scripts/backup.sh` | — |
| NFR-9 видалення клієнта з активними угодами — з підтвердженням | `deleteClient` | — |
