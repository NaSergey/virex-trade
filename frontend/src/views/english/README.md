# Учебник английского (админка)

Раздел владельца на `admin.<домен>/english`: уроки, карточки, практика, слух и речь по
Friends Starter (SB + WB). Спека — `docs/superpowers/specs/2026-10-21-english-course-design.md`.

Раздел изолирован: весь код — этот каталог и `backend/src/english/`. Продукт от него не зависит.

## Где что

- `content/` — материал: `course.ts` (разделы и страницы книг), `units/b1.ts`…`b8.ts` (слова,
  уроки, упражнения по блокам книги), `vocab/` (общий словарь: NGSL 1.2 — New General Service
  List, CC BY-SA 4.0, переводы и примеры свои, `v5` — разговорное дополнение), `themes.ts`
  (темы словаря), тесты целостности.
- `model/` — чистая логика с тестами: проверка ответов, интервалы карточек, колода, курс,
  выравнивание диктанта, озвучка.
- `api/hooks.ts` — запросы к `/api/admin/english/*`.
- `*Page.tsx`, `Layout.tsx`, `components/`, `english.css` — страницы и стили. На телефоне
  раздел — приложение: нижняя панель вкладок, сверху общая шапка админки с выбором раздела, манифест для главного
  экрана — `frontend/public/assets/english/`.
- `tools/` — озвучка: `export-texts.ts` выгружает все фразы, `audio.py` озвучивает их
  нейросетевым голосом Kokoro (Apache-2.0, голос `af_heart` — выбран владельцем по образцам).

## Озвучка

Фразы материала звучат записями (`model/audio.ts`: файл `<хэш текста>.mp3`), свои слова и
всё без записи — лучшим голосом браузера. Записи в git не лежат (десятки МБ):

1. `cd frontend && npx vite-node --config vitest.config.ts src/views/english/tools/export-texts.ts texts.json`
2. `python -I src/views/english/tools/audio.py texts.json public/assets/english-audio/af_heart` —
   озвучивает только новые фразы; модель — каталог kokoro (см. docstring скрипта). Каталог
   назван голосом (`VOICE` в `model/audio.ts`): другой голос — другой каталог и `VOICE`.
3. На сервер: каталог голоса — в `/opt/english-audio/<голос>/` (например,
   `tar czf - -C public/assets/english-audio/af_heart . | ssh … 'tar xzf - -C /opt/english-audio/af_heart'`);
   nginx поддомена отдаёт `/opt/english-audio/` как `/assets/english-audio/` (`location` в
   `/etc/nginx/conf.d/virex-admin.conf`). Без этого шага на проде звучит голос браузера.

## Точки подключения

1. `backend/src/app.module.ts` — `EnglishModule` в `imports`.
2. `frontend/src/app/(internal)/AdminChrome.tsx` — пункт `english` в `ITEMS`; ключ
   `adminShell.english` в `frontend/src/shared/i18n/messages/{ru,en}.json`.
3. `frontend/src/app/admin/(in)/english/` — файлы маршрутов (реэкспорт отсюда).
4. `backend/prisma/schema.prisma` — блок между метками `═══ english ═══` и `═══ /english ═══`.
5. `frontend/public/assets/english/` (манифест и иконки), строка `english-audio` в корневом
   `.gitignore`, на сервере — `/opt/english-audio/` и её `location` в nginx.

## Снести

1. Удалить `frontend/src/views/english/`, `frontend/src/app/admin/(in)/english/`,
   `backend/src/english/`, `frontend/public/assets/english/`.
2. Убрать точки подключения 1, 2, блок схемы (4) и строку `.gitignore` (5).
3. На базе: `npx prisma db push --accept-data-loss` или
   `DROP TABLE english_cards, english_words, english_lessons, english_answers, english_days, english_theme_words, english_themes;`
4. На сервере: `rm -r /opt/english-audio` и её `location` из nginx.

## Перенести в другой проект

Скопировать оба каталога. Бэкенду нужны `PrismaService`, `JwtAuthGuard` и guard владельца
(`AdminGuard`) — заменить на свои. Фронту — `apiJson` (`shared/api/http`), примитивы
`shared/ui` (`Button`, `Input`, `Seg`, `PageHead`, `EmptyState`, `ErrorNote`, `Skeleton`,
`Wrap`), `usePersistentValue` и `adminPath`.
