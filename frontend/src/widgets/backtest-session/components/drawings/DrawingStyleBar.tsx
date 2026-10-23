'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Lock, LockOpen, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { cn } from '@/shared/lib/utils/css';
import { COLOR_VAR, DRAWING_COLORS, TEXT_MAX, type Drawing, type DrawingWidth } from '../../lib/drawings/types';

const WIDTHS: DrawingWidth[] = [1, 2, 3];

type Patch = Partial<Pick<Drawing, 'color' | 'width' | 'text' | 'locked'>>;

/** Цвет, толщина, текст, закрепление, копия и удаление выделенной фигуры — поверх левого верхнего угла графика. */
export function DrawingStyleBar({
  drawing,
  onStyle,
  onDelete,
  onCopy,
}: {
  drawing: Drawing;
  onStyle: (patch: Patch) => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const t = useTranslations('backtest.drawings');
  // У позиции и диапазона цвет задан смыслом (прибыль/убыток), у Фибоначчи — цветами уровней: выбирать нечего.
  const fixed = drawing.kind === 'long' || drawing.kind === 'short' || drawing.kind === 'range';
  const colored = !fixed && drawing.kind !== 'fib';
  const widths = !fixed;
  return (
    <div className="draw-style" role="toolbar" aria-label={t('style')}>
      {/* key — новая фигура начинает поле со своего текста, а не с черновика прежней. */}
      {drawing.kind === 'text' && <TextField key={drawing.id} value={drawing.text ?? ''} onCommit={(text) => onStyle({ text })} />}
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
            aria-label={drawing.kind === 'text' ? t('size', { n: w }) : t('width', { n: w })}
            aria-pressed={drawing.width === w}
            onClick={() => onStyle({ width: w })}
          >
            <span style={{ height: w }} />
          </Button>
        ))}
      <Button
        variant="none"
        className={cn('draw-btn', drawing.locked && 'on')}
        aria-pressed={!!drawing.locked}
        aria-label={drawing.locked ? t('unlock') : t('lock')}
        title={drawing.locked ? t('unlock') : t('lock')}
        onClick={() => onStyle({ locked: !drawing.locked })}
      >
        {drawing.locked ? <Lock size={15} /> : <LockOpen size={15} />}
      </Button>
      <Button variant="none" className="draw-btn" aria-label={t('clone')} title={`${t('clone')} (Ctrl+C, Ctrl+V)`} onClick={onCopy}>
        <Copy size={15} />
      </Button>
      <Button variant="none" className="draw-btn" aria-label={t('delete')} title={`${t('delete')} (Delete)`} onClick={onDelete}>
        <Trash2 size={15} />
      </Button>
    </div>
  );
}

/**
 * Текст надписи. Пишется в фигуру по Enter и уходу с поля, а не на каждую букву:
 * каждая запись — шаг отмены, и Ctrl+Z стирал бы по букве. Новая надпись
 * приходит пустой — поле сразу в фокусе.
 */
function TextField({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  const t = useTranslations('backtest.drawings');
  const [draft, setDraft] = useState(value);
  // Клик по графику снимает выделение, и поле уходит из разметки раньше, чем
  // браузер пришлёт blur, — набранное дописывается при размонтировании.
  const latest = useRef({ draft, saved: value, onCommit });
  useEffect(() => {
    latest.current.onCommit = onCommit;
  });
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.draft !== l.saved) l.onCommit(l.draft);
    },
    [],
  );
  const edit = (text: string) => {
    latest.current.draft = text;
    setDraft(text);
  };
  const commit = () => {
    const l = latest.current;
    if (l.draft === l.saved) return;
    l.saved = l.draft;
    onCommit(l.draft);
  };
  return (
    <Input
      className="draw-text"
      value={draft}
      maxLength={TEXT_MAX}
      placeholder={t('textPlaceholder')}
      aria-label={t('tool.text')}
      autoFocus={!value}
      onChange={(e) => edit(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          edit(latest.current.saved);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
