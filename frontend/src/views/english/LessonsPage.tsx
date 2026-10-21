'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { useEnglishState, useSetLesson } from './api/hooks';
import { CourseList, type CourseRow } from './components/CourseList';
import { LessonView } from './components/LessonView';
import { COURSE, EXERCISES, LESSONS, SECTION_BY_ID, WORDS } from './content';
import { currentSection, nextSection, scoreOf, sectionItems } from './model/course';

/** Suspense — не ожидание: маршрут с useSearchParams вне него не собирается статически. */
export function LessonsPage() {
  return (
    <Suspense fallback={null}>
      <Lessons />
    </Suspense>
  );
}

const NO_LESSONS: ReadonlySet<string> = new Set();
const NO_ANSWERS = new Map();

function Lessons() {
  const params = useSearchParams();
  const state = useEnglishState();
  const setLesson = useSetLesson();
  const done = state.data?.lessons ?? NO_LESSONS;
  const answers = state.data?.answers ?? NO_ANSWERS;

  const current = currentSection(COURSE, done);
  const selected = SECTION_BY_ID.get(params.get('s') ?? '') ?? current ?? COURSE[0];

  const rows: CourseRow[] = useMemo(
    () =>
      COURSE.map((section) => {
        const items = sectionItems(section, EXERCISES);
        return { section, done: done.has(section.id), score: items.length ? scoreOf(items, answers) : null };
      }),
    [done, answers],
  );
  const selectedRow = rows.find((r) => r.section.id === selected.id)!;

  return (
    <>
      <PageHead title="Уроки" lede="Friends Starter по порядку: объяснение, слова раздела, задание по книге." />
      <ErrorNote error={state.error ?? setLesson.error} fallback="Не удалось загрузить прогресс" />
      <div className="en-lessons">
        <CourseList rows={rows} currentId={current?.id ?? null} selectedId={selected.id} />
        <LessonView
          key={selected.id}
          section={selected}
          lesson={LESSONS.get(selected.id)}
          words={WORDS.filter((w) => w.unit === selected.id)}
          practice={selectedRow.score}
          done={selectedRow.done}
          ready={state.isSuccess}
          onToggleDone={() => setLesson.mutate({ id: selected.id, done: !selectedRow.done })}
          next={nextSection(COURSE, selected.id)}
        />
      </div>
    </>
  );
}
