# План дня (админка)

Раздел владельца на `admin.<домен>/plan`: недельный шаблон, план на каждый день, напоминания в
Telegram с кнопками «Сажусь за работу / Иду гулять / Забил» и отчётность. Спека —
`docs/superpowers/specs/2026-10-23-daily-plan-design.md`.

Раздел изолирован: весь код — этот каталог и `backend/src/plan/`. Продукт от него не зависит.

## Где что

- `api/hooks.ts` — запросы к `/api/admin/plan/*`. Исходы блоков и отчёт считает сервер
  (`backend/src/plan/plan-stats.ts`) — одна копия на страницу и бота.
- `model/` — запись времени, подписи исходов, пояс устройства.
- `*Page.tsx`, `Layout.tsx`, `components/`, `plan.css` — страницы и стили. На телефоне раздел —
  приложение (вкладки внизу, шапка админки скрыта через `body:has(.pl-app)`).

## Шаблон владельца

`backend/src/scripts/seed-plan.ts` — будни владельца (2026-10-23) одним прогоном; непустой шаблон
не трогает без `--replace`. Прод: `docker compose --env-file .env.prod -f docker-compose.prod.yml
exec api node dist/scripts/seed-plan.js`.

## Точки подключения

1. `backend/src/app.module.ts` — `PlanModule` в `imports`.
2. `backend/src/telegram/telegram.service.ts` — `onCallback`/`onCommand`, `sendMessage`,
   `editMessage` (общие, без раздела могут остаться).
3. `frontend/src/app/(internal)/AdminChrome.tsx` — пункт `plan` в `ITEMS`; ключ
   `adminShell.plan` в `frontend/src/shared/i18n/messages/{ru,en}.json`.
4. `frontend/src/app/admin/(in)/plan/` — файлы маршрутов.
5. `backend/prisma/schema.prisma` — блок между метками `═══ plan ═══` и `═══ /plan ═══`.

## Снести

1. Удалить `frontend/src/views/plan/`, `frontend/src/app/admin/(in)/plan/`, `backend/src/plan/`.
2. Убрать точки подключения 1, 3 и блок схемы (5).
3. На базе: `DROP TABLE plan_items, plan_days, plan_blocks, plan_settings;`
