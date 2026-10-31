# Стратегия (админка)

Раздел владельца на `admin.<домен>/strategy`: интрадей Smart Money из видео SanchoDT на истории BTC —
формализованные правила, готовый отчёт бектеста с вариантами, проверка цифр автора, обучение на ошибках
с проверкой вперёд и выключаемая теория «Трейдинг = математика». Спека —
`docs/superpowers/specs/2026-10-30-strategy-lab-design.md`.

Раздел изолирован: весь код — этот каталог и `backend/src/strategy/`. Продукт от него не зависит.

## Где что

- Движок — чистые функции `backend/src/strategy/` (`series` → `events` → `setups` → `simulate`,
  `author-check`, `learning`, `theory`, `report`). Отчёт считает `worker` раз в сутки
  (`strategy-report.service.ts`) и пишет в `strategy_reports`; `api` только отдаёт.
- `api/types.ts` — копия `backend/src/strategy/report.types.ts`, правятся вместе.
- Правка правил, обучения или формы отчёта — поднять `STRATEGY_VERSION` в `report.ts`: отчёт пересчитается сам.

## Точки подключения

1. `backend/src/app.module.ts` — `StrategyModule` в `imports`.
2. `frontend/src/app/(internal)/AdminChrome.tsx` — пункт `strategy` в `ITEMS`; ключ
   `adminShell.strategy` в `frontend/src/shared/i18n/messages/{ru,en}.json`.
3. `frontend/src/app/admin/(in)/strategy/` — файл маршрута.
4. `backend/prisma/schema.prisma` — блок между метками `═══ strategy ═══` и `═══ /strategy ═══`.

## Снести

1. Удалить `frontend/src/views/strategy/`, `frontend/src/app/admin/(in)/strategy/`, `backend/src/strategy/`.
2. Убрать точки подключения 1, 2 и блок схемы (4).
3. На базе: `DROP TABLE strategy_reports;`
