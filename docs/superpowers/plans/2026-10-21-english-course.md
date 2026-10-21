# Учебник английского в админке — план

> Исполнение — гибрид: движок, страницы и бэкенд пишутся инлайн (Opus), материал курса — четыре
> субагента Sonnet параллельно (большая задача без готового кода в плане: чтение сканов книг и
> набор уроков), проверка английского в материале — ревьюер Sonnet. План компактный по просьбе
> владельца (экономия токенов): код не дублируется здесь и в файлах — здесь интерфейсы, файлы,
> проверки.

**Цель:** раздел `admin.<домен>/english` — уроки, карточки, практика, слух и речь по Friends
Starter (SB + WB). Спека — `docs/superpowers/specs/2026-10-21-english-course-design.md`.

**Архитектура:** материал — статика `frontend/src/views/english/content/`; прогресс — четыре
таблицы `english_*` через `backend/src/english` (`api/admin/english`, `JwtAuthGuard` +
`AdminGuard`); интервалы карточек считает фронт, сервер хранит.

## Ограничения (из спеки)

- Раздел — два каталога: `backend/src/english/`, `frontend/src/views/english/`; точки подключения —
  `AppModule.imports`, `ITEMS` в `AdminChrome` + ключ `adminShell.english`, файлы маршрутов
  `app/admin/(in)/english/`. Тексты интерфейса — по-русски внутри вью, стили — `english.css` вью.
- Тексты и упражнения книги не копировать: слова — из словаря SB (стр. 92–95), переводы,
  объяснения, примеры и упражнения — свои; на книгу — ссылки на страницы.
- Таблицы без `userId`, без связей; блок схемы между метками `═══ english ═══`.
- Всё из `shared/ui` (`Button`, `Input`, `Seg`, `PageHead`, `EmptyState`, `ErrorNote`, `Skeleton`,
  `Wrap`); цвет верно/неверно — `.pos`/`.neg`; нулевой радиус, без свечений и градиентов.

## Страницы книг (номер PDF = номер в книге)

| Раздел | id | SB | WB |
|---|---|---|---|
| Starting Point | `sp` | 4–7 | 2–3 |
| Units 1–3 | `u01`–`u03` | 8–13 | 4, 5, 6 |
| Revision 1 | `r1` | 14–15 | 7–9 |
| Units 4–6 | `u04`–`u06` | 16–21 | 10, 11, 12 |
| Revision 2 | `r2` | 22–23 | 13–15 |
| Reading Corner | `rc1` | 24–25 | 16–17 |
| Units 7–9 | `u07`–`u09` | 26–31 | 18, 19, 20 |
| Revision 3 | `r3` | 32–33 | 21–23 |
| Units 10–12 | `u10`–`u12` | 34–39 | 24, 25, 26 |
| Revision 4 | `r4` | 40–41 | 27–29 |
| Culture Corner | `cc1` | 42–43 | 30–31 |
| Units 13–15 | `u13`–`u15` | 44–49 | 32, 33, 34 |
| Revision 5 | `r5` | 50–51 | 35–37 |
| Units 16–18 | `u16`–`u18` | 52–57 | 38, 39, 40 |
| Revision 6 | `r6` | 58–59 | 41–43 |
| Reading Corner | `rc2` | 60–61 | 44–45 |
| Units 19–21 | `u19`–`u21` | 62–67 | 46, 47, 48 |
| Revision 7 | `r7` | 68–69 | 49–51 |
| Units 22–24 | `u22`–`u24` | 70–75 | 52, 53, 54 |
| Revision 8 | `r8` | 76–77 | 55–57 |
| Culture Corner | `cc2` | 78–79 | 58–59 |
| Autumn, Winter, Spring, Summer | `autumn`… | 80–87 | — |
| Mini Play | `play` | 88–91 | 60–61 (Friends Quiz) |

Ответы к «Check Yourself» — WB стр. 62–63. Отрендеренные страницы:
`<scratchpad>/books/sb/p-NNN.jpg`, `<scratchpad>/books/wb/p-NNN.jpg`.

---

### Task 1: бэкенд `english` (класс B — контракт)

**Files:** create `backend/src/english/{english.module,english.controller,english.service,english.service.spec}.ts`,
`backend/src/english/dto/{card-state,word,lesson,answer}.dto.ts`; modify `backend/prisma/schema.prisma`
(блок в конце), `backend/src/app.module.ts` (импорт).

**Produces (HTTP, префикс `/api/admin/english`):**
- `GET state` → `{ cards: {cardId, due, interval, ease, reps, lapses, firstAt}[], words: {id, en, ru}[], lessons: string[], answers: {itemId, unit, right, wrong, lastCorrect}[] }` (даты — ISO).
- `PUT cards` body `{ cardId, due, interval, ease, reps, lapses, firstAt }` → `{ ok }`; `cardId` ≤ 120 символов (в теле, не в адресе).
- `POST words` `{ en, ru }` → `{ id, en, ru }`; `DELETE words/:id` → `{ ok }` / 404 (снимает и `english_cards` `my:<id>`).
- `PUT lessons/:lessonId` `{ done }` → `{ ok }`.
- `POST answers` `{ itemId, unit, correct }` → `{ ok }` (upsert с инкрементом `right`/`wrong`).

- [ ] Тест сервиса (Prisma — мок, стиль `hl-wallets.service.spec.ts`): upsert карточки с датами
  `Date`; ответ создаёт `right: 1, wrong: 0` и инкрементирует; удаление слова удаляет `my:<id>` и
  404 при `count: 0`; `setLesson(false)` — `deleteMany`.
- [ ] Реализация, `npx prisma generate` (остановить `nest watch`, если держит движок), `npx jest src/english`.
- [ ] `npx prisma db push` локально (только новые таблицы), коммит.

### Task 2: модель и каркас материала (класс B — общий код страниц)

**Files:** create в `frontend/src/views/english/`:
- `content/types.ts` — `Section`, `Word`, `Block`, `Lesson`, `Exercise`, `ContentBlock`;
- `content/course.ts` — `COURSE: Section[]` по таблице выше (тема и грамматика по-русски);
- `content/units/b1.ts`…`b8.ts` — пустые `ContentBlock` (заполняет Task 4);
- `content/index.ts` — `WORDS`, `LESSONS: Map<unit, Lesson>`, `EXERCISES`, `SECTION_BY_ID`;
- `content/content.test.ts` — целостность (ниже);
- `model/check.ts` (+test) — `normalize(s)`, `isCorrect(input, answers)`;
- `model/srs.ts` (+test) — `Grade = 0|1|2|3`, `CardState {due, interval, ease, reps, lapses, firstAt}` (мс), `review(prev, grade, now)`, `delayLabel(ms)`;
- `model/course.ts` (+test) — `currentSection`, `openUnits`, `sectionItems`, `nextSection`, `scoreOf`;
- `model/deck.ts` (+test) — `DeckCard`, `buildDeck(words, open, custom)`, `queue(deck, states, now, newLimit)` → `{ due, fresh, newToday, nextDue }`, `pickCard(q, lastId)`;
- `model/align.ts` (+test) — `alignWords(expected, actual)` → `{ word, kind: 'ok'|'missing'|'extra' }[]`;
- `model/random.ts` (+test) — `shuffle(list, rng)`, `sample(list, n, rng)`, `mulberry32(seed)`;
- `model/phrases.ts` — фразы слуха и речи из открытых разделов.

**Типы материала:**
```ts
type SectionKind = 'unit' | 'revision' | 'reading';
interface Section { id: string; kind: SectionKind; title: string; topic: string; grammar: string[];
  sb: [number, number]; wb: [number, number] | null; covers?: string[] }
interface Word { en: string; ru: string; unit: string; example?: [string, string] }
type Block =
  | { type: 'p'; text: string }                       // *выделение*
  | { type: 'rule'; title?: string; rows: [string, string, string][] } // форма · пример · перевод
  | { type: 'examples'; items: [string, string][] }    // EN · RU
  | { type: 'note'; text: string }
  | { type: 'book'; items: string[] };
interface Lesson { unit: string; blocks: Block[] }
type Exercise = { id: string; unit: string } & (
  | { type: 'choice'; q: string; options: string[]; answer: number; ru?: string }
  | { type: 'gap'; q: string; answers: string[]; ru?: string }
  | { type: 'order'; words: string[]; answers: string[]; ru?: string }
  | { type: 'translate'; ru: string; answers: string[] });
interface ContentBlock { words: Word[]; lessons: Lesson[]; exercises: Exercise[] }
```

**Интервалы** — как в спеке («Карточки»). `queue`: к повторению — `due <= now`, плюс
изучаемые (`interval === 0`) с `due <= now + 10 мин`, по `due`; новых — `newLimit − newToday`
(новое за день — `firstAt` с начала местных суток), в порядке колоды.

**Целостность материала (`content.test.ts`):** id разделов уникальны; у слова и упражнения раздел
есть в `COURSE`; id карточек (`unit:en`) и упражнений уникальны, id упражнения начинается с
`<unit>-`; у каждого `unit` — урок, ≥ 5 слов (у Unit 4 в словаре книги их 7), ≥ 10 упражнений, все четыре вида; у `reading` —
урок и слова, без упражнений; у `revision` — урок, `covers` из `unit`, без своих упражнений и
слов; `choice` — `___` в `q`, ответ в пределах, варианты различны; `gap` — ровно один `___`;
`order` — слова = токены `answers[0]` (без регистра и пунктуации); у каждого урока есть блок `book`.
Пока блоки пусты, проверки «≥ 8 слов / ≥ 10 упражнений» идут только по заполненным разделам
(список `FILLED` в тесте — расширяется по мере Task 4; в конце — все).

- [ ] Тесты моделей → реализация → `npx vitest run src/views/english` → коммит.

### Task 3: подключение и запросы (класс B — стык бэк↔фронт)

**Files:** create `views/english/api/hooks.ts` (`useEnglishState`, `useSaveCard`, `useAddWord`,
`useDeleteWord`, `useSetLesson`, `useAnswer` — мутации правят кэш `['english','state']` сразу,
ошибка — перечитка), `views/english/Layout.tsx` (вкладки `.en-tabs` + `english.css`),
`views/english/english.css`, `views/english/README.md` (перенос и снос);
`app/admin/(in)/english/{layout,page}.tsx`, `cards/page.tsx`, `practice/page.tsx`, `speak/page.tsx`
— реэкспорт; modify `AdminChrome.tsx` (пункт, горит на `/english*`), `ru.json`/`en.json`
(`adminShell.english`).

- [ ] Подключение, `npx tsc --noEmit -p frontend` → коммит.
- **Контрольная точка 1 (Sonnet-ревью):** Tasks 1–3 — контракт, изоляция, guard.

### Task 4: материал курса — 4 субагента Sonnet параллельно

| Агент | Файлы | Разделы |
|---|---|---|
| A | `b1.ts`, `b2.ts` | `sp`, `u01`–`u03`, `r1`; `u04`–`u06`, `r2`, `rc1` |
| B | `b3.ts`, `b4.ts` | `u07`–`u09`, `r3`; `u10`–`u12`, `r4`, `cc1` |
| C | `b5.ts`, `b6.ts` | `u13`–`u15`, `r5`; `u16`–`u18`, `r6`, `rc2` |
| D | `b7.ts`, `b8.ts` | `u19`–`u21`, `r7`; `u22`–`u24`, `r8`, `cc2`, сезоны, `play` |

Каждый: читает свои страницы SB и WB и словарь (SB 92–95), пишет только свои файлы; слова — все
из словаря по своим разделам; урок `unit` — абзац-объяснение по-русски, `rule`, `examples` (6–10),
`note` о типичной ошибке русскоговорящего, `book` (SB — что прочитать и повторить вслух, WB — какие
упражнения); 12–14 упражнений на юнит, все четыре вида, только на лексике и грамматике уже
пройденного (без опережения книги); урок `revision` — что повторить + `book` (SB, WB, проверить по
ответам WB 62–63); урок `reading` — о чём текст, слова + `book`. Тест целостности по своим разделам
зелёный (агент добавляет свои id в `FILLED`).

- **Контрольная точка 2 (Sonnet-ревью):** английский в упражнениях, ответах и примерах, переводы,
  опережение книги, соответствие юнитам.

### Task 5: страница «Уроки» (`LessonsPage`) — класс C

Список курса (отметка «пройден», % практики, текущий подсвечен) + открытый урок (`?s=<id>`, без
него — текущий): шапка, грамматика, блоки, слова юнита с 🔊, задание по книге, «Практика →»,
«Отметить пройденным» / «Пройден · снять», «Дальше: …». На ≤ 900px список — над уроком.

### Task 6: страница «Карточки» (`CardsPage`) — класс C

Счётчики, `Seg` направления и новых в день (`usePersistentValue`, ключи `virex.english.dir`,
`virex.english.newPerDay`), карточка с переворотом (клик/пробел), кнопки 1–4 с интервалом,
«На сегодня всё» со временем следующего повторения, «Мои слова» (форма + список с удалением).

### Task 7: страница «Практика» (`PracticePage`) — класс C

Список разделов с % и «Работа над ошибками»; прогон `?unit=<id>|mistakes`: четыре вида задания,
проверка (Enter), верно/неверно с правильным ответом и 🔊, ответ — `useAnswer` сразу; итог, «Ещё
раз», «Следующий раздел». Повторение — 15 случайных из `covers`, ошибки — все с `lastCorrect=false`
(список фиксируется на старте).

### Task 8: «Слух и речь» (`SpeakPage`) + `model/speech.ts` — класс C

`speak(text, slow)`, `pickVoice(voices)` (+test), `canListen()`, `listen(onText, onEnd)`; диктант
(🔊 / медленно, ввод, разметка `alignWords`) и произношение (🎤, распознанное, отмеченные слова, %);
без распознавания — сообщение и только диктант.

### Task 9: проверка и документация

- [ ] `npx vitest run`, `npx jest src/english`, `npx eslint` по новым файлам, `npx next build`.
- [ ] Раздел в `CLAUDE.md` (кратко: где лежит, правила изоляции, снос), память, коммит.
- [ ] На сервере после деплоя — `prisma db push` (только новые таблицы).
