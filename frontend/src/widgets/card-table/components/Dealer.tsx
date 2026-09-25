'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils/css';
import { DEALER } from '../lib/motion';
import { CardBack } from './PlayingCard';

/** Сколько висит одна реплика крупье. */
const LINE_MS = 1600;

/**
 * Место крупье — колода вверху сукна. От неё летят карты, к ней уходят
 * сброшенные; на каждую раздачу, сданную вживую, она тасуется заново.
 */
export function Dealer({ shuffleKey }: { shuffleKey: string | null }) {
  const t = useTranslations('cardTable');
  return (
    <div className="ct-dealer-spot" style={{ left: `${DEALER.x}%`, top: `${DEALER.y}%` }}>
      <div key={shuffleKey ?? 'idle'} className={cn('ct-deck', shuffleKey && 'ct-shuffle')} aria-hidden>
        <CardBack size="sm" />
        <CardBack size="sm" />
        <CardBack size="sm" />
      </div>
      <span className="ct-dealer-label">{t('dealer')}</span>
    </div>
  );
}

/**
 * Реплика крупье — строка в центральной колонке стола. Не поверх сукна: там
 * она на невысоком экране заходила на банк. В колонке ей отведена своя строка
 * постоянной высоты, поэтому ни на что она не наезжает и ничего не двигает.
 *
 * Реплики идут очередью по одной (`lines[0]`), каждая своё время, — быстрые
 * события не слипаются и не ложатся друг на друга. Что сказать, решает игра
 * (`render`): здесь только очередь и строка.
 */
export function DealerSay<L extends { id: number }>({
  lines,
  onShift,
  render,
}: {
  lines: L[];
  onShift: (id: number) => void;
  render: (line: L) => string;
}) {
  const line = lines[0] ?? null;

  useEffect(() => {
    if (!line) return;
    const id = setTimeout(() => onShift(line.id), LINE_MS);
    return () => clearTimeout(id);
  }, [line, onShift]);

  return (
    <div className="ct-say" aria-live="polite">
      {line && (
        <span key={line.id} className="ct-say-line">
          {render(line)}
        </span>
      )}
    </div>
  );
}
