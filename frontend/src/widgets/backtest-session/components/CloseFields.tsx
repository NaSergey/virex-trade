'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils/css';

/**
 * Поле со степперами «− +» справа в одной строке: цена и объём в окнах закрытия.
 * Шаг — снаружи (шаг цены монеты, шаг лота): поле не знает, что оно двигает.
 */
export function StepRow({
  children,
  onDec,
  onInc,
  label,
}: {
  children: ReactNode;
  onDec: () => void;
  onInc: () => void;
  /** Что двигают степперы — для скринридера. */
  label: string;
}) {
  const t = useTranslations('backtest');
  return (
    <div className="step-row">
      {children}
      <Button tight aria-label={`${label}: ${t('stepDown')}`} onClick={onDec}>
        −
      </Button>
      <Button tight aria-label={`${label}: ${t('stepUp')}`} onClick={onInc}>
        +
      </Button>
    </div>
  );
}

const MARKS = [0, 25, 50, 75, 100] as const;

/**
 * Доля позиции: ползунок задаёт её плавно, а ряд под ним — сразу 0/25/50/75/100 %,
 * как деления на ползунке биржи. Нажатая доля подсвечена, пока объём ровно на ней.
 */
export function PctMarks({ pct, onPick }: { pct: number; onPick: (pct: number) => void }) {
  return (
    <div className="pct-marks" role="group">
      {MARKS.map((m) => (
        <button
          key={m}
          type="button"
          className={cn('pct-mark', Math.round(pct) === m && 'on')}
          aria-pressed={Math.round(pct) === m}
          onClick={() => onPick(m)}
        >
          {m}%
        </button>
      ))}
    </div>
  );
}
