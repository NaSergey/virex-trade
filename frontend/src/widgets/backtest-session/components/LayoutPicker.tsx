'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { LAYOUTS, type LayoutId } from '../lib/panes';
import { useOutsideClose } from './CoinPicker';

/** Схема раскладки — прямоугольники ячеек в рамке 20×14, как на кнопках TradingView. */
const CELLS: Record<LayoutId, [number, number, number, number][]> = {
  '1': [[0, 0, 20, 14]],
  '2h': [
    [0, 0, 9.5, 14],
    [10.5, 0, 9.5, 14],
  ],
  '2v': [
    [0, 0, 20, 6.5],
    [0, 7.5, 20, 6.5],
  ],
  '3': [
    [0, 0, 12, 14],
    [13, 0, 7, 6.5],
    [13, 7.5, 7, 6.5],
  ],
  '4': [
    [0, 0, 9.5, 6.5],
    [10.5, 0, 9.5, 6.5],
    [0, 7.5, 9.5, 6.5],
    [10.5, 7.5, 9.5, 6.5],
  ],
};

function Scheme({ layout }: { layout: LayoutId }) {
  return (
    <svg width={20} height={14} viewBox="0 0 20 14" aria-hidden>
      {CELLS[layout].map(([x, y, w, h], i) => (
        <rect key={i} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} fill="none" stroke="currentColor" />
      ))}
    </svg>
  );
}

/**
 * Раскладка графиков терминала: кнопка в верхней панели и меню из пяти схем
 * (спека 2026-11-17). Escape и нажатие мимо закрывают меню.
 */
export function LayoutPicker({ value, onChange }: { value: LayoutId; onChange: (layout: LayoutId) => void }) {
  const t = useTranslations('backtest');
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(open, root, close);

  return (
    <div className="layout-pick" ref={root} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <Button
        variant="bare"
        tight
        aria-label={t('layout.label')}
        title={t('layout.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <LayoutGrid size={16} />
      </Button>
      {open && (
        <div className="layout-menu" role="menu" aria-label={t('layout.label')}>
          {LAYOUTS.map((id) => (
            <Button
              key={id}
              variant="none"
              role="menuitemradio"
              aria-checked={id === value}
              aria-label={t(`layout.${id}`)}
              title={t(`layout.${id}`)}
              className={cn('layout-opt', id === value && 'on')}
              onClick={() => {
                close();
                if (id !== value) onChange(id);
              }}
            >
              <Scheme layout={id} />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
