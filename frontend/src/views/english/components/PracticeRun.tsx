'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useAnswer, type EnglishState } from '../api/hooks';
import { COURSE, EXERCISES, SECTION_BY_ID } from '../content';
import type { Exercise } from '../content/types';
import { nextSection, sectionItems } from '../model/course';
import { sample, shuffle } from '../model/random';
import { ExerciseView } from './ExerciseView';

export const MISTAKES = 'mistakes';
/** Повторение — столько случайных заданий из юнитов блока. */
const REVISION_SIZE = 15;

/** Задания прогона. Фиксируются на старте: решённая ошибка не должна выпасть из идущего прогона. */
function itemsFor(id: string, answers: EnglishState['answers']): Exercise[] {
  if (id === MISTAKES) return shuffle(EXERCISES.filter((e) => answers.get(e.id)?.lastCorrect === false));
  const section = SECTION_BY_ID.get(id);
  if (!section) return [];
  const items = sectionItems(section, EXERCISES);
  return section.kind === 'revision' ? sample(items, REVISION_SIZE) : items;
}

const hasPractice = (id: string) => {
  const s = SECTION_BY_ID.get(id);
  return !!s && sectionItems(s, EXERCISES).length > 0;
};

/** Прогон заданий раздела, повторения или работы над ошибками. */
export function PracticeRun({
  id,
  answers,
  onRestart,
}: {
  id: string;
  answers: EnglishState['answers'];
  onRestart: () => void;
}) {
  const answer = useAnswer();
  const [items] = useState(() => itemsFor(id, answers));
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);

  const title = id === MISTAKES ? 'Работа над ошибками' : (SECTION_BY_ID.get(id)?.title ?? id);
  const back = (
    <Link className="en-back" href="/english/practice">
      ← Все разделы
    </Link>
  );

  if (items.length === 0) {
    return (
      <>
        {back}
        <EmptyState title={id === MISTAKES ? 'Ошибок нет' : 'У раздела нет заданий'}>
          {id === MISTAKES ? 'Все задания, где ты ошибался, уже решены верно.' : 'Выбери другой раздел.'}
        </EmptyState>
      </>
    );
  }

  if (index >= items.length) {
    const right = results.filter(Boolean).length;
    const next = id === MISTAKES ? null : nextSection(COURSE, id, (s) => hasPractice(s.id));
    return (
      <section className="en-run">
        {back}
        <h2>{title}</h2>
        <p className="en-total">
          Верно <b className={right === items.length ? 'pos' : undefined}>{right}</b> из {items.length}
        </p>
        <div className="en-ex-actions">
          <Button variant="solid" onClick={onRestart}>
            Ещё раз
          </Button>
          {right < items.length && id !== MISTAKES ? (
            <Link className="btn" href={`/english/practice?unit=${MISTAKES}`}>
              Работа над ошибками
            </Link>
          ) : null}
          {next ? (
            <Link className="btn" href={`/english/practice?unit=${next.id}`}>
              Дальше: {next.title}
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  const current = items[index];
  return (
    <section className="en-run">
      {back}
      <header className="en-run-head">
        <h2>{title}</h2>
        <span className="muted">
          {index + 1} / {items.length}
        </span>
      </header>
      <div className="en-progress" aria-hidden>
        {items.map((it, i) => (
          <span key={it.id} className={i < results.length ? (results[i] ? 'is-right' : 'is-wrong') : undefined} />
        ))}
      </div>
      <ExerciseView
        key={current.id}
        exercise={current}
        onAnswer={(correct) => {
          setResults((r) => [...r, correct]);
          answer.mutate({ itemId: current.id, unit: current.unit, correct });
        }}
        onNext={() => setIndex((i) => i + 1)}
      />
    </section>
  );
}
