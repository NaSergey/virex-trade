'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Select } from '@/shared/ui/Field';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { dateFormat } from '@/shared/lib/utils/intl';
import { useEnglishState, useSaveCard } from './api/hooks';
import { MyWords } from './components/MyWords';
import { Say } from './components/Say';
import { COURSE, WORDS } from './content';
import { THEMES } from './content/themes';
import { VOCAB } from './content/vocab';
import { openUnits } from './model/course';
import { catalog, deckOf, pickCard, queue } from './model/deck';
import { delayLabel, review, type Grade } from './model/srs';

type Dir = 'en' | 'ru';
const NEW_LIMITS = [10, 20, 50] as const;
const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 0, label: 'Не знаю', key: '1' },
  { grade: 1, label: 'Трудно', key: '2' },
  { grade: 2, label: 'Помню', key: '3' },
  { grade: 3, label: 'Знаю', key: '4' },
];

const decodeDir = (raw: string | null): Dir => (raw === 'ru' ? 'ru' : 'en');
const encodeDir = (v: Dir) => v;
const decodeLimit = (raw: string | null) => {
  const n = Number(raw);
  return (NEW_LIMITS as readonly number[]).includes(n) ? n : 20;
};
const encodeLimit = (v: number) => String(v);
const decodeDeck = (raw: string | null) => raw || 'all';
const encodeDeck = (v: string) => v;

const nextAt = (ms: number) =>
  dateFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

/**
 * Карточки слов. Колода — что учим сейчас (`deckOf`): всё сразу, свои слова,
 * учебник, общий словарь, тема словаря или своя тема. Интервалы —
 * `model/srs.ts`; «Знаю» убирает слово из карточек насовсем, вернуть — в словаре.
 */
export function CardsPage() {
  const state = useEnglishState();
  const save = useSaveCard();
  const [dir, setDir] = usePersistentValue<Dir>('virex.english.dir', decodeDir, 'en', encodeDir);
  const [newLimit, setNewLimit] = usePersistentValue<number>('virex.english.newPerDay', decodeLimit, 20, encodeLimit);
  const [deckSpec, setDeckSpec] = usePersistentValue<string>('virex.english.deck', decodeDeck, 'all', encodeDeck);
  const [now, setNow] = useState(() => Date.now());
  const [lastId, setLastId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);

  const data = state.data;
  const cards = useMemo(() => catalog(WORDS, VOCAB, data?.words ?? []), [data?.words]);
  const deck = useMemo(
    () => (data ? deckOf(cards, deckSpec, openUnits(COURSE, data.lessons), data.themes) : []),
    [cards, data, deckSpec],
  );
  const q = useMemo(() => (data ? queue(deck, data.cards, now, newLimit) : null), [data, deck, now, newLimit]);
  const card = q ? pickCard(q, lastId) : null;
  const prev = card && data ? (data.cards.get(card.id) ?? null) : null;

  // Часы идут, только пока показывать нечего: слово со сроком «через минуту»
  // придёт само. Пока карточка на экране, они стоят — иначе срок соседней
  // наступил бы посреди показа, и карточка подменилась бы на глазах, а оценка
  // ушла бы чужой.
  const idle = card === null;
  useEffect(() => {
    if (!idle) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [idle]);

  const answer = (grade: Grade) => {
    if (!card) return;
    const t = Date.now();
    save.mutate({ cardId: card.id, state: review(prev, grade, t) });
    setLastId(card.id);
    setFlipped(false);
    setNow(t);
  };

  // Клавиатура: пробел/Enter — перевернуть, 1–4 — ответ. В полях ввода и с
  // модификаторами (Ctrl+1 — вкладка браузера) — молчит; пробел и Enter на
  // кнопке или ссылке — её собственное нажатие (🔊, сама карточка).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!card || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!flipped && (e.key === ' ' || e.key === 'Enter')) {
        if (tag === 'BUTTON' || tag === 'A') return;
        e.preventDefault();
        setFlipped(true);
      } else if (flipped) {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) answer(g.grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const front = card ? (dir === 'en' ? card.en : card.ru) : '';
  const back = card ? (dir === 'en' ? card.ru : card.en) : '';

  return (
    <>
      <PageHead title="Карточки" lede="Незнакомое возвращается через минуты, знакомое — через дни. «Знаю» — слово больше не покажется." />
      <ErrorNote error={state.error ?? save.error} fallback="Не удалось сохранить ответ" />

      {!data ? (
        <SkeletonLines widths={[60, 100, 40]} />
      ) : (
        <>
          <MyWords words={data.words} />

          <div className="en-deckbar">
            <Select aria-label="Колода" value={deckSpec} onChange={(e) => setDeckSpec(e.target.value)}>
              <option value="all">Все слова</option>
              <option value="my">Мои слова</option>
              <option value="book">Учебник</option>
              <option value="vocab">Общий словарь</option>
              {data.themes.length > 0 ? (
                <optgroup label="Мои темы">
                  {data.themes.map((t) => (
                    <option key={t.id} value={`mine:${t.id}`}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Темы словаря">
                {THEMES.map((t) => (
                  <option key={t.id} value={`theme:${t.id}`}>
                    {t.title}
                  </option>
                ))}
              </optgroup>
            </Select>
            <Seg<Dir>
              ariaLabel="Направление"
              options={[
                { value: 'en', label: 'EN → RU' },
                { value: 'ru', label: 'RU → EN' },
              ]}
              value={dir}
              onChange={setDir}
            />
            <Seg<number>
              ariaLabel="Новых слов в день"
              options={NEW_LIMITS.map((n) => ({ value: n, label: `${n}`, title: `${n} новых в день` }))}
              value={newLimit}
              onChange={setNewLimit}
            />
          </div>

          <p className="en-stats muted">
            Повторить: {q!.due.length + q!.ahead.length} · новых сегодня: {Math.min(q!.newToday, newLimit)} из {newLimit} ·
            в колоде: {deck.length}
          </p>

          {card ? (
            <section className="en-card-box">
              <Button variant="none" className="en-card" onClick={() => setFlipped(true)} aria-label="Перевернуть карточку">
                <span className="en-card-front" lang={dir === 'en' ? 'en' : 'ru'}>
                  {front}
                </span>
                {flipped ? (
                  <span className="en-card-back">
                    <span lang={dir === 'en' ? 'ru' : 'en'}>{back}</span>
                    {card.example ? (
                      <span className="en-card-example muted">
                        <span lang="en">{card.example[0]}</span>
                        <span>{card.example[1]}</span>
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="en-card-hint muted">Нажми — перевернуть</span>
                )}
              </Button>
              <div className="en-card-say">
                <Say text={card.en} />
                {card.example && flipped ? <Say text={card.example[0]} /> : null}
              </div>
              {flipped ? (
                <div className="en-grades">
                  {GRADES.map(({ grade, label, key }) => (
                    <Button key={grade} variant={grade === 2 ? 'solid' : 'default'} onClick={() => answer(grade)}>
                      <span>{label}</span>
                      <span className="en-grade-in muted">
                        <span className="en-grade-key">{key} · </span>
                        {grade === 3 ? 'больше нет' : delayLabel(review(prev, grade, now).due - now)}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : deck.length === 0 ? (
            <EmptyState title="В колоде пусто">
              {deckSpec.startsWith('mine:')
                ? 'Добавь слова в эту тему в словаре.'
                : 'Слова учебника приходят из уроков, свои — из формы выше.'}
            </EmptyState>
          ) : (
            <EmptyState title="На сегодня всё">
              {q!.nextDue ? `Следующее повторение — ${nextAt(q!.nextDue)}. ` : ''}
              {q!.newToday >= newLimit ? 'Лимит новых слов на сегодня пройден.' : 'Новых слов в этой колоде не осталось.'}
            </EmptyState>
          )}
        </>
      )}
    </>
  );
}
