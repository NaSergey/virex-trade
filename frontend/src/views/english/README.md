# Учебник английского (админка)

Раздел владельца на `admin.<домен>/english`: уроки, карточки, практика, слух и речь по
Friends Starter (SB + WB). Спека — `docs/superpowers/specs/2026-10-21-english-course-design.md`.

Раздел изолирован: весь код — этот каталог и `backend/src/english/`. Продукт от него не зависит.

## Где что

- `content/` — материал: `course.ts` (разделы и страницы книг), `units/b1.ts`…`b8.ts` (слова,
  уроки, упражнения по блокам книги), `content.test.ts` (целостность).
- `model/` — чистая логика с тестами: проверка ответов, интервалы карточек, колода, курс,
  выравнивание диктанта, озвучка.
- `api/hooks.ts` — запросы к `/api/admin/english/*`.
- `*Page.tsx`, `Layout.tsx`, `components/`, `english.css` — страницы и стили.

## Точки подключения

1. `backend/src/app.module.ts` — `EnglishModule` в `imports`.
2. `frontend/src/app/(internal)/AdminChrome.tsx` — пункт `english` в `ITEMS`; ключ
   `adminShell.english` в `frontend/src/shared/i18n/messages/{ru,en}.json`.
3. `frontend/src/app/admin/(in)/english/` — файлы маршрутов (реэкспорт отсюда).
4. `backend/prisma/schema.prisma` — блок между метками `═══ english ═══` и `═══ /english ═══`.

## Снести

1. Удалить `frontend/src/views/english/`, `frontend/src/app/admin/(in)/english/`,
   `backend/src/english/`.
2. Убрать точки подключения 1, 2 и блок схемы (4).
3. На базе: `npx prisma db push --accept-data-loss` или
   `DROP TABLE english_cards, english_words, english_lessons, english_answers;`

## Перенести в другой проект

Скопировать оба каталога. Бэкенду нужны `PrismaService`, `JwtAuthGuard` и guard владельца
(`AdminGuard`) — заменить на свои. Фронту — `apiJson` (`shared/api/http`), примитивы
`shared/ui` (`Button`, `Input`, `Seg`, `PageHead`, `EmptyState`, `ErrorNote`, `Skeleton`,
`Wrap`), `usePersistentValue` и `adminPath`.
