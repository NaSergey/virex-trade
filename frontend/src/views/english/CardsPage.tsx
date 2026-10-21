'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { dateFormat } from '@/shared/lib/utils/intl';
import { useEnglishState, useSaveCard } from './api/hooks';
import { MyWords } from './components/MyWords';
import { Say } from './components/Say';
import { COURSE, WORDS } from './content';
import { openUnits } from './model/course';
import { buildDeck, pickCard, queue } from './model/deck';
import { delayLabel, review, type Grade } from './model/srs';

type Dir = 'en' | 'ru';
const NEW_LIMITS = [5, 10, 20] as const;
const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 0, label: 'Не знаю', key: '1' },
  { grade: 1, label: 'Трудно', key: '2' },
  { grade: 2, label: 'Знаю', key: '3' },
  { grade: 3, label: 'Легко', key: '4' },
];

const decodeDir = (raw: string | null): Dir => (raw === 'ru' ? 'ru' : 'en');
const encodeDir = (v: Dir) => v;
const decodeLimit = (raw: string | null) => {
  const n = Number(raw);
  return (NEW_LIMITS as readonly number[]).includes(n) ? n : 10;
};
const encodeLimit = (v: number) => String(v);

const nextAt = (ms: number) =>
  dateFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

/**
 * Карточки слов: колода — слова пройденных разделов, текущего и свои.
 * Интервалы — `model/srs.ts`; ответ уходит на сервер сразу.
 */
export function CardsPage() {
  const state = useEnglishState();
  const save = useSaveCard();
  const [dir, setDir] = usePersistentValue<Dir>('virex.english.dir', decodeDir, 'en', encodeDir);
  const [newLimit, setNewLimit] = usePersistentValue<number>('virex.english.newPerDay', decodeLimit, 10, encodeLimit);
  const [now, setNow] = useState(() => Date.now());
  const [lastId, setLastId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);

  const data = state.data;
  const deck = useMemo(
    () => (data ? buildDeck(WORDS, openUnits(COURSE, data.lessons), data.words) : []),
    [data],
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
      <PageHead title="Карточки" lede="Слова пройденных уроков и свои. Незнакомое возвращается через минуты, выученное — через дни.">
        <div className="en-controls">
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
            options={NEW_LIMITS.map((n) => ({ value: n, label: `${n} новых` }))}
            value={newLimit}
            onChange={setNewLimit}
          />
        </div>
      </PageHead>
      <ErrorNote error={state.error ?? save.error} fallback="Не удалось сохранить ответ" />

      {!data ? (
        <SkeletonLines widths={[60, 100, 40]} />
      ) : (
        <>
          <p className="en-stats muted">
            К повторению: {q!.due.length + q!.ahead.length} · новых сегодня: {Math.min(q!.newToday, newLimit)} из{' '}
            {newLimit} · в колоде: {deck.length}
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
                        <span lang="en">{card.example[0]}</span> — {card.example[1]}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="en-card-hint muted">Нажми или пробел — перевернуть</span>
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
                        {key} · {delayLabel(review(prev, grade, now).due - now)}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : deck.length === 0 ? (
            <EmptyState title="Колода пуста">
              Слова приходят из уроков: открой текущий урок — его слова попадут сюда. Или добавь свои ниже.
            </EmptyState>
          ) : (
            <EmptyState title="На сегодня всё">
              {q!.nextDue ? `Следующее повторение — ${nextAt(q!.nextDue)}. ` : ''}
              {q!.newToday >= newLimit ? 'Лимит новых слов на сегодня пройден.' : 'Новые слова откроются со следующим уроком.'}
            </EmptyState>
          )}

          <MyWords words={data.words} />
        </>
      )}
    </>
  );
}
