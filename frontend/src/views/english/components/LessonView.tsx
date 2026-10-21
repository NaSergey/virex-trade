'use client';

import Link from 'next/link';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { Lesson, Section, Word } from '../content/types';
import { Blocks } from './Blocks';
import { Say } from './Say';

const KIND: Record<Section['kind'], string> = { unit: 'Урок', revision: 'Повторение', reading: 'Чтение' };

export const pages = ([from, to]: [number, number]) => (from === to ? `${from}` : `${from}–${to}`);

const WORD_COLUMNS: LedgerColumn<Word>[] = [
  {
    key: 'en',
    header: 'Слово',
    render: (w) => (
      <span className="en-phrase">
        <span lang="en">{w.en}</span>
        <Say text={w.en} />
      </span>
    ),
  },
  { key: 'ru', header: 'Перевод', render: (w) => w.ru },
  { key: 'ex', header: 'Пример', render: (w) => (w.example ? <span lang="en">{w.example[0]}</span> : null) },
];

/** Открытый урок: тема, объяснение, слова, задание по книге и переход к практике. */
export function LessonView({
  section,
  lesson,
  words,
  practice,
  done,
  ready,
  onToggleDone,
  next,
}: {
  section: Section;
  lesson: Lesson | undefined;
  words: readonly Word[];
  /** Практика раздела: решено из всего; null — практики нет. */
  practice: { right: number; total: number } | null;
  done: boolean;
  /** Прогресс загружен — отметку можно ставить. */
  ready: boolean;
  onToggleDone: () => void;
  next: Section | null;
}) {
  return (
    <article className="en-lesson">
      <header className="en-lesson-head">
        <p className="en-kicker muted">
          {KIND[section.kind]} · SB стр. {pages(section.sb)}
          {section.wb ? ` · WB стр. ${pages(section.wb)}` : ''}
        </p>
        <h2>{section.title}</h2>
        <p className="en-topic">{section.topic}</p>
        {section.grammar.length > 0 ? (
          <ul className="en-grammar">
            {section.grammar.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        ) : null}
      </header>

      {lesson ? (
        <Blocks blocks={lesson.blocks} />
      ) : (
        <EmptyState title="Материал раздела ещё не готов">
          Открой книгу: SB стр. {pages(section.sb)}
          {section.wb ? `, WB стр. ${pages(section.wb)}` : ''}.
        </EmptyState>
      )}

      {words.length > 0 ? (
        <section className="en-section">
          <h3>Слова раздела · {words.length}</h3>
          <LedgerTable columns={WORD_COLUMNS} rows={[...words]} rowKey={(w) => w.en} />
        </section>
      ) : null}

      <footer className="en-lesson-foot">
        {practice && practice.total > 0 ? (
          <Link className="btn" href={`/english/practice?unit=${section.id}`}>
            Практика · {practice.right}/{practice.total}
          </Link>
        ) : null}
        <Button variant={done ? 'default' : 'solid'} disabled={!ready} onClick={onToggleDone}>
          {done ? 'Пройден ✓ · снять отметку' : 'Отметить пройденным'}
        </Button>
        {next ? (
          <Link className="en-next" href={`/english/lessons?s=${next.id}`}>
            Дальше: {next.title} →
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
