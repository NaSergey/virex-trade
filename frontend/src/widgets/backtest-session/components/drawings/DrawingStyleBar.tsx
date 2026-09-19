'use client';

import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils/css';
import { COLOR_VAR, DRAWING_COLORS, type Drawing, type DrawingWidth } from '../../lib/drawings/types';

const WIDTHS: DrawingWidth[] = [1, 2, 3];

/** Цвет, толщина и удаление выделенной фигуры — поверх левого верхнего угла графика. */
export function DrawingStyleBar({
  drawing,
  onStyle,
  onDelete,
}: {
  drawing: Drawing;
  onStyle: (patch: Partial<Pick<Drawing, 'color' | 'width'>>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('backtest.drawings');
  // У позиции цвет задан смыслом зон (прибыль/убыток), у Фибоначчи — цветами уровней: выбирать нечего.
  const colored = drawing.kind !== 'long' && drawing.kind !== 'short' && drawing.kind !== 'fib';
  const widths = drawing.kind !== 'long' && drawing.kind !== 'short';
  return (
    <div className="draw-style" role="toolbar" aria-label={t('style')}>
      {colored &&
        DRAWING_COLORS.map((c) => (
          <Button
            key={c}
            variant="none"
            className={cn('draw-swatch', drawing.color === c && 'on')}
            aria-label={t(`color.${c}`)}
            aria-pressed={drawing.color === c}
            onClick={() => onStyle({ color: c })}
          >
            {/* Цвет палитры — значение фигуры, а не оформление кнопки, поэтому инлайном. */}
            <span style={{ background: COLOR_VAR[c] }} />
          </Button>
        ))}
      {widths &&
        WIDTHS.map((w) => (
          <Button
            key={w}
            variant="none"
            className={cn('draw-width', drawing.width === w && 'on')}
            aria-label={t('width', { n: w })}
            aria-pressed={drawing.width === w}
            onClick={() => onStyle({ width: w })}
          >
            <span style={{ height: w }} />
          </Button>
        ))}
      <Button variant="none" className="draw-btn" aria-label={t('delete')} title={t('delete')} onClick={onDelete}>
        <Trash2 size={15} />
      </Button>
    </div>
  );
}
