'use client';

import { useRef, useState } from 'react';
import { Equal } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Tooltip } from '@/shared/ui/Tooltip';

/** Заголовок колонки объёма — кнопка: снять закрепления и поделить объём поровну. */
export function SplitHeader({ label, hint, onSplit }: { label: string; hint: string; onSplit: () => void }) {
  return (
    <Tooltip text={hint}>
      <Button variant="none" className="cg-split" onClick={onSplit}>
        <Equal size={9} aria-hidden />
        {label}
      </Button>
    </Tooltip>
  );
}

/** Закрепление по номеру уровня: число — закрепить, null — снять. */
export const withPin = (pins: Record<number, number>, i: number, v: number | null): Record<number, number> => {
  const next = { ...pins };
  if (v == null) delete next[i];
  else next[i] = v;
  return next;
};

/**
 * Ячейка таблицы, которую правят руками (таблицы сетки фиксации, «Сетки» и
 * бота): тихая заливка без рамки, как поля биржевых терминалов, под курсором —
 * плотнее, в фокусе — черта снизу.
 * Посчитанное значение приглушено, закреплённое руками — ярче и с чертой слева.
 * `note` — мелкая подпись в той же ячейке слева (монеты у доли объёма).
 *
 * В фокусе — свой текст, как его набирают; ушёл фокус или нажат Enter —
 * значение закрепляется, пустое снимает закрепление, неразборчивое оставляет
 * прежнее, Esc отменяет правку.
 */
export function EditCell({
  display,
  note,
  pinned,
  ignored,
  label,
  hint,
  onCommit,
}: {
  display: string;
  note?: string;
  pinned: boolean;
  /** Закреплённое ничего не изменит (стоп слабее прежнего) — значение зачёркнуто. */
  ignored?: boolean;
  label: string;
  hint: string;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    const raw = (text ?? '').replace(/[\s%]/g, '').replace(',', '.');
    setText(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text == null) return;
    if (raw === '') return onCommit(null);
    const v = Number(raw);
    if (Number.isFinite(v) && v > 0) onCommit(v);
  };
  return (
    <label className="cg-edit" data-pinned={pinned || undefined} data-ignored={ignored || undefined} title={hint}>
      {note != null && <span className="cg-note">{note}</span>}
      <Input
        className="cg-cell"
        inputMode="decimal"
        aria-label={label}
        value={text ?? display}
        onFocus={(e) => {
          setText(display.replace(/[\s%]/g, ''));
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
