'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Seg } from '@/shared/ui/Seg';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { useEnglishState } from './api/hooks';
import { Dictation } from './components/Dictation';
import { Pronounce } from './components/Pronounce';
import { COURSE, EXERCISES, LESSONS } from './content';
import { openUnits } from './model/course';
import { phrasesFor } from './model/phrases';
import { mulberry32, shuffle } from './model/random';
import { canListen } from './model/speech';

type Mode = 'dictation' | 'speech';
const noop = () => () => {};

/**
 * Слух и речь: у книги есть аудиодиски, у владельца — нет, а без слуха и речи
 * английский остаётся «для чтения». Фразы — из пройденных разделов и текущего;
 * результаты не сохраняются: это тренировка, а не учёт.
 */
export function SpeakPage() {
  const state = useEnglishState();
  // Распознавание есть только в браузере; на сервере — нет, без расхождения гидрации.
  const listenable = useSyncExternalStore(noop, canListen, () => false);
  const [mode, setMode] = useState<Mode>('dictation');
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [index, setIndex] = useState(0);

  const lessons = state.data?.lessons;
  const phrases = useMemo(
    () => (lessons ? shuffle(phrasesFor(openUnits(COURSE, lessons), LESSONS, EXERCISES), mulberry32(seed)) : []),
    [lessons, seed],
  );
  const phrase = phrases.length ? phrases[index % phrases.length] : null;
  const next = () => setIndex((i) => i + 1);

  return (
    <>
      <PageHead title="Слух и речь" lede="Фразы пройденных уроков: напиши на слух или скажи вслух — проверка по словам.">
        <Seg<Mode>
          ariaLabel="Упражнение"
          options={[
            { value: 'dictation', label: 'Диктант' },
            { value: 'speech', label: 'Произношение' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </PageHead>
      <ErrorNote error={state.error} fallback="Не удалось загрузить прогресс" />
      {!state.data ? (
        <SkeletonLines widths={[60, 100]} />
      ) : !phrase ? (
        <EmptyState title="Фраз пока нет">Они появятся из уроков: открой текущий урок, и его примеры попадут сюда.</EmptyState>
      ) : mode === 'dictation' ? (
        <Dictation key={`d${index}`} phrase={phrase} onNext={next} />
      ) : listenable ? (
        <Pronounce key={`s${index}`} phrase={phrase} onNext={next} />
      ) : (
        <EmptyState title="Распознавание речи недоступно">
          Оно работает в Chrome и Edge. Здесь остаётся диктант — или открой эту страницу в Chrome.
        </EmptyState>
      )}
    </>
  );
}
