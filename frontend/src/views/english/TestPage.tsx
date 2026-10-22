'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { useEnglishState } from './api/hooks';
import { QuizRun } from './components/QuizRun';
import { COURSE, WORDS } from './content';
import { VOCAB } from './content/vocab';
import { catalog, deckOf } from './model/deck';
import type { QuizDir } from './model/quiz';
import { specTitle } from './model/words';

const ALL_UNITS: ReadonlySet<string> = new Set(COURSE.map((s) => s.id));
const SIZES = [10, 20, 50] as const;
const decodeDir = (raw: string | null): QuizDir => (raw === 'ru' ? 'ru' : 'en');
const encodeDir = (v: QuizDir) => v;
const decodeSize = (raw: string | null) => {
  const n = Number(raw);
  return (SIZES as readonly number[]).includes(n) ? n : 20;
};
const encodeSize = (v: number) => String(v);

/** Suspense — не ожидание: маршрут с useSearchParams вне него не собирается статически. */
export function TestPage() {
  return (
    <Suspense fallback={null}>
      <Test />
    </Suspense>
  );
}

/**
 * Тест по теме слов: случайные слова подборки и четыре варианта перевода.
 * Проходить можно сколько угодно раз — каждый раз новые слова и порядок;
 * результат не трогает карточки, ответы идут в счётчик дня.
 */
function Test() {
  const spec = useSearchParams().get('deck') ?? 'all';
  const state = useEnglishState();
  const [dir, setDir] = usePersistentValue<QuizDir>('virex.english.quizDir', decodeDir, 'en', encodeDir);
  const [size, setSize] = usePersistentValue<number>('virex.english.quizSize', decodeSize, 20, encodeSize);
  const [round, setRound] = useState(0);
  // Повтор ошибок — тест только из слов, на которых ошибся.
  const [only, setOnly] = useState<ReadonlySet<string> | null>(null);

  const data = state.data;
  const cards = useMemo(() => catalog(WORDS, VOCAB, data?.words ?? []), [data?.words]);
  const deck = useMemo(() => {
    if (!data) return [];
    const all = deckOf(cards, spec, ALL_UNITS, data.themes);
    return only ? all.filter((c) => only.has(c.id)) : all;
  }, [cards, data, spec, only]);

  const restart = () => {
    setOnly(null);
    setRound((r) => r + 1);
  };

  return (
    <>
      <PageHead title={`Тест · ${data ? specTitle(spec, data.themes) : ''}`} lede="Выбери верный перевод. Тест можно проходить сколько угодно раз — слова каждый раз новые.">
        <div className="en-controls">
          <Seg<QuizDir>
            ariaLabel="Направление"
            options={[
              { value: 'en', label: 'EN → RU' },
              { value: 'ru', label: 'RU → EN' },
            ]}
            value={dir}
            onChange={(v) => {
              setDir(v);
              restart();
            }}
          />
          <Seg<number>
            ariaLabel="Вопросов"
            options={SIZES.map((n) => ({ value: n, label: `${n}`, title: `${n} вопросов` }))}
            value={size}
            onChange={(v) => {
              setSize(v);
              restart();
            }}
          />
        </div>
      </PageHead>
      <ErrorNote error={state.error} fallback="Не удалось загрузить слова" />
      <Link className="en-back" href="/english/words">
        ← Темы
      </Link>
      {!data ? (
        <SkeletonLines widths={[60, 100, 100]} />
      ) : (
        <QuizRun
          key={`${spec}|${dir}|${size}|${round}`}
          deck={deck}
          pool={cards}
          size={size}
          dir={dir}
          spec={spec}
          onAgain={restart}
          onMistakes={(ids) => {
            setOnly(new Set(ids));
            setRound((r) => r + 1);
          }}
        />
      )}
    </>
  );
}
