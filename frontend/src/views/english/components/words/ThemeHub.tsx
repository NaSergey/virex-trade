'use client';

import { useMemo } from 'react';
import { Button } from '@/shared/ui/Button';
import type { EnglishState } from '../../api/hooks';
import { COURSE } from '../../content';
import { THEMES } from '../../content/themes';
import { deckOf, type DeckCard } from '../../model/deck';
import { countStatuses } from '../../model/words';
import { Themes } from './Themes';

const ALL_UNITS: ReadonlySet<string> = new Set(COURSE.map((s) => s.id));

interface Tile {
  spec: string;
  title: string;
}

/** Прогресс подборки: выучено, изучаю, всего — и полоса из двух частей. */
function Progress({ known, learning, total }: { known: number; learning: number; total: number }) {
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
  return (
    <>
      <span className="en-tprog" aria-hidden>
        <span className="en-tprog-known" style={{ width: pct(known) }} />
        <span className="en-tprog-learning" style={{ width: pct(learning) }} />
      </span>
      <span className="en-tcount muted">
        выучено <b>{known}</b> из {total}
        {learning ? ` · изучаю ${learning}` : ''}
      </span>
    </>
  );
}

/**
 * Темы слов — с чего начинается вкладка: общая статистика и темы с прогрессом.
 * У темы три действия: учить карточками, пройти тест (сколько угодно раз) и
 * открыть её слова списком.
 */
export function ThemeHub({
  data,
  cards,
  onLearn,
  onTest,
  onBrowse,
}: {
  data: EnglishState;
  cards: readonly DeckCard[];
  onLearn: (spec: string) => void;
  onTest: (spec: string) => void;
  onBrowse: (spec: string) => void;
}) {
  const total = useMemo(() => countStatuses(cards, data.cards), [cards, data.cards]);

  const groups = useMemo(() => {
    const talk = THEMES.filter((t) => t.id !== 'func').map((t) => ({ spec: `theme:${t.id}`, title: t.title }));
    const own: Tile[] = [
      ...data.themes.map((t) => ({ spec: `mine:${t.id}`, title: t.title })),
      ...(data.words.length ? [{ spec: 'my', title: 'Мои слова' }] : []),
    ];
    return [
      { title: 'Мои темы', tiles: own },
      { title: 'Разговорные темы', tiles: talk },
      {
        title: 'Основа',
        tiles: [
          { spec: 'book', title: 'Учебник Friends Starter' },
          { spec: 'theme:func', title: 'Служебные слова' },
        ],
      },
    ].filter((g) => g.tiles.length > 0);
  }, [data.themes, data.words.length]);

  const stats = (spec: string) => {
    const deck = deckOf(cards, spec, ALL_UNITS, data.themes);
    return countStatuses(deck, data.cards);
  };

  return (
    <div className="en-hub">
      <section className="en-hub-total">
        <p className="en-hub-big">
          <b>{total.known}</b>
          <span className="muted"> из {total.all} слов выучено</span>
        </p>
        <Progress known={total.known} learning={total.learning} total={total.all} />
      </section>

      {groups.map((g) => (
        <section key={g.title} className="en-section">
          <h3>{g.title}</h3>
          <ul className="en-tiles">
            {g.tiles.map((t) => {
              const s = stats(t.spec);
              return (
                <li key={t.spec} className="en-tile">
                  <span className="en-tile-title">{t.title}</span>
                  <Progress known={s.known} learning={s.learning} total={s.all} />
                  <span className="en-tile-actions">
                    <Button variant="solid" disabled={s.all === 0} onClick={() => onLearn(t.spec)}>
                      Учить
                    </Button>
                    <Button disabled={s.all === 0} onClick={() => onTest(t.spec)}>
                      Тест
                    </Button>
                    <Button variant="bare" onClick={() => onBrowse(t.spec)}>
                      Слова
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="en-section">
        <h3>Своя тема под разговор</h3>
        <Themes themes={data.themes} selectedId={null} onSelect={(id) => onBrowse(`mine:${id}`)} onDeleted={() => {}} />
      </section>
    </div>
  );
}
