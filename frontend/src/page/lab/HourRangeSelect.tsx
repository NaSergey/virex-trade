'use client';

import { Clock, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => String(h).padStart(2, '0');

const SELECT_CLASS =
  'cursor-pointer rounded bg-elevated-2 px-1 py-1 font-medium text-fg outline-none [&>option]:bg-elevated-2 [&>option]:text-fg';

/**
 * Часы входа — компактной пилюлей в шапке фильтров, рядом с Long/Short,
 * вместо отдельной строки внизу секции: это такой же «когда» фильтр, что и
 * сессия, и место ему у остальных контролов. Подпись заменена иконкой +
 * title, иначе бар не влезает.
 */
export function HourRangeSelect({
  from,
  to,
  onChange,
}: {
  from?: number;
  to?: number;
  onChange: (range: { hourFrom?: number; hourTo?: number }) => void;
}) {
  const isSet = from != null || to != null;
  const parse = (v: string) => (v === '' ? undefined : Number(v));

  return (
    <div
      title="Часы входа (локальное время)"
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-elevated-2 p-0.5 pl-2 text-xs"
    >
      <Clock className="h-3.5 w-3.5 shrink-0 text-muted" />
      <select
        value={from ?? ''}
        onChange={(e) => onChange({ hourFrom: parse(e.target.value) })}
        className={SELECT_CLASS}
      >
        <option value="">с —</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{hh(h)}:00</option>
        ))}
      </select>
      <span className="text-muted">–</span>
      <select value={to ?? ''} onChange={(e) => onChange({ hourTo: parse(e.target.value) })} className={SELECT_CLASS}>
        <option value="">до —</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{hh(h)}:59</option>
        ))}
      </select>
      {/* Всегда в разметке (меняется только вид), чтобы бар не менял ширину
          при выборе часа и не толкал соседей. */}
      <button
        onClick={() => onChange({ hourFrom: undefined, hourTo: undefined })}
        disabled={!isSet}
        title="Сбросить часы"
        className={cn(
          'rounded p-1 transition-colors',
          isSet ? 'cursor-pointer text-muted hover:bg-elevated hover:text-fg' : 'cursor-default text-subtle opacity-40',
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
