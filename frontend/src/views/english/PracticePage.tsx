'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { PageHead } from '@/shared/ui/PageHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { useEnglishState, type EnglishState } from './api/hooks';
import { MISTAKES, PracticeRun } from './components/PracticeRun';
import { COURSE, EXERCISES } from './content';
import type { Section } from './content/types';
import { scoreOf, sectionItems } from './model/course';

/** Suspense — не ожидание: маршрут с useSearchParams вне него не собирается статически. */
export function PracticePage() {
  return (
    <Suspense fallback={null}>
      <Practice />
    </Suspense>
  );
}

function Practice() {
  const id = useSearchParams().get('unit');
  const state = useEnglishState();
  const [round, setRound] = useState(0);

  return (
    <>
      <PageHead title="Практика" lede="Задания на грамматику и слова каждого юнита. Ошибки собираются в «Работу над ошибками»." />
      <ErrorNote error={state.error} fallback="Не удалось загрузить прогресс" />
      {!state.data ? (
        <SkeletonLines widths={[100, 80, 90]} />
      ) : id ? (
        <PracticeRun
          key={`${id}:${round}`}
          id={id}
          answers={state.data.answers}
          onRestart={() => setRound((r) => r + 1)}
        />
      ) : (
        <PracticeList answers={state.data.answers} />
      )}
    </>
  );
}

interface Row {
  id: string;
  title: string;
  right: number;
  total: number;
  wrong: number;
}

const COLUMNS: LedgerColumn<Row>[] = [
  { key: 'title', header: 'Раздел', render: (r) => r.title },
  { key: 'score', header: 'Решено', align: 'right', cellClassName: 'n', render: (r) => (r.total ? `${r.right} / ${r.total}` : '') },
  {
    key: 'wrong',
    header: 'Ошибок',
    align: 'right',
    cellClassName: 'n',
    render: (r) => (r.wrong ? <span className="neg">{r.wrong}</span> : '—'),
  },
];

function PracticeList({ answers }: { answers: EnglishState['answers'] }) {
  const mistakes = EXERCISES.filter((e) => answers.get(e.id)?.lastCorrect === false).length;
  const rowOf = (s: Section): Row => {
    const items = sectionItems(s, EXERCISES);
    const { right, total } = scoreOf(items, answers);
    const wrong = items.filter((e) => answers.get(e.id)?.lastCorrect === false).length;
    return { id: s.id, title: s.title, right, total, wrong };
  };
  const rows: Row[] = [
    ...(mistakes > 0 ? [{ id: MISTAKES, title: 'Работа над ошибками', right: 0, total: 0, wrong: mistakes }] : []),
    ...COURSE.filter((s) => s.kind !== 'reading')
      .map(rowOf)
      .filter((r) => r.total > 0),
  ];
  return (
    <LedgerTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/english/practice?unit=${r.id}`}
      empty="Заданий пока нет — материал курса ещё не загружен."
    />
  );
}
