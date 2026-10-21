'use client';

import Link from 'next/link';
import { cn } from '@/shared/lib/utils/css';
import type { Section } from '../content/types';

export interface CourseRow {
  section: Section;
  done: boolean;
  /** Практика раздела: решено из всего; null — практики нет. */
  score: { right: number; total: number } | null;
}

/** Курс по порядку книги: пройденное отмечено, текущий подсвечен, открытый — выбран. */
export function CourseList({
  rows,
  currentId,
  selectedId,
}: {
  rows: readonly CourseRow[];
  currentId: string | null;
  selectedId: string;
}) {
  return (
    <nav className="en-course" aria-label="Курс">
      <ol>
        {rows.map(({ section, done, score }) => (
          <li key={section.id} className={cn(`en-course-${section.kind}`, section.id === currentId && 'is-current')}>
            <Link
              href={`/english?s=${section.id}`}
              aria-current={section.id === selectedId ? 'page' : undefined}
              scroll={false}
            >
              <span className={cn('en-mark', done && 'pos')} aria-label={done ? 'пройден' : undefined}>
                {done ? '✓' : section.id === currentId ? '●' : '·'}
              </span>
              <span className="en-course-title">{section.title}</span>
              {score && score.total > 0 ? (
                <span className="en-course-score muted">
                  {score.right}/{score.total}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
