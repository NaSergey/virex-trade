'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Brush,
  Eye,
  EyeOff,
  Magnet,
  Minus,
  MoveUpRight,
  Ruler,
  Square,
  SeparatorVertical,
  Slash,
  TrendingDown,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils/css';
import type { ToolId } from '../../lib/drawings/types';
import { FibIcon } from './FibIcon';

const ICON = 16;

type Icon = ComponentType<{ size?: number }>;

const TOOL_ICON: Record<ToolId, Icon> = {
  trend: Slash,
  ray: MoveUpRight,
  hline: Minus,
  vline: SeparatorVertical,
  arrow: ArrowUpRight,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  fib: FibIcon,
  long: TrendingUp,
  short: TrendingDown,
  brush: Brush,
  rect: Square,
  ruler: Ruler,
};

/** Кнопка панели — группа инструментов; у группы из одного выпадающего списка нет. */
const GROUPS: ToolId[][] = [['trend', 'ray', 'hline', 'vline'], ['fib'], ['long', 'short'], ['brush'], ['arrow', 'arrowUp', 'arrowDown'], ['rect'], ['ruler']];

/**
 * Полоса инструментов слева от графика; на узком экране — лента над ним (CSS).
 * Группа помнит последний взятый из неё инструмент и показывает его иконку.
 *
 * Первое нажатие берёт инструмент, второе — по уже взятому — открывает список
 * остальных инструментов группы. Отдельной стрелки у кнопки нет: она теснила
 * полосу и читалась как лишняя точка. Снять инструмент — второе нажатие у
 * инструмента без группы, нажатие на взятый в списке или Esc.
 */
export function DrawingToolbar({
  tool,
  onTool,
  magnet,
  onMagnet,
  hidden,
  onHidden,
  canClear,
  onClear,
}: {
  tool: ToolId | null;
  onTool: (tool: ToolId | null) => void;
  magnet: boolean;
  onMagnet: (v: boolean) => void;
  hidden: boolean;
  onHidden: (v: boolean) => void;
  canClear: boolean;
  onClear: () => void;
}) {
  const t = useTranslations('backtest.drawings');
  const [lastOf, setLastOf] = useState<Record<number, ToolId>>({});
  const [open, setOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open == null) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (gi: number, id: ToolId) => {
    setLastOf((m) => ({ ...m, [gi]: id }));
    setOpen(null);
    onTool(id);
  };

  const press = (gi: number, group: ToolId[], current: ToolId) => {
    if (tool !== current) {
      pick(gi, current);
      return;
    }
    if (group.length > 1) setOpen(open === gi ? null : gi);
    else onTool(null);
  };

  return (
    <div className="draw-bar" ref={rootRef} role="toolbar" aria-label={t('toolbar')} data-tour="term-draw">
      {GROUPS.map((group, gi) => {
        const current = group.includes(tool as ToolId) ? (tool as ToolId) : (lastOf[gi] ?? group[0]);
        const Glyph = TOOL_ICON[current];
        return (
          <div key={gi} className="draw-group">
            <Button
              variant="none"
              className={cn('draw-btn', group.includes(tool as ToolId) && 'on')}
              aria-label={t(`tool.${current}`)}
              aria-pressed={tool === current}
              aria-haspopup={group.length > 1 ? 'menu' : undefined}
              aria-expanded={group.length > 1 ? open === gi : undefined}
              title={t(`tool.${current}`)}
              onClick={() => press(gi, group, current)}
            >
              <Glyph size={ICON} />
            </Button>
            {open === gi && (
              <div className="draw-menu" role="menu">
                {group.map((id) => {
                  const G = TOOL_ICON[id];
                  return (
                    <Button key={id} variant="none" role="menuitem" className={cn('draw-item', tool === id && 'on')} onClick={() => (tool === id ? (setOpen(null), onTool(null)) : pick(gi, id))}>
                      <G size={ICON} />
                      <span>{t(`tool.${id}`)}</span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <span className="draw-sep" />
      <Button variant="none" className={cn('draw-btn', magnet && 'on')} aria-pressed={magnet} aria-label={t('magnet')} title={t('magnet')} onClick={() => onMagnet(!magnet)}>
        <Magnet size={ICON} />
      </Button>
      <Button
        variant="none"
        className={cn('draw-btn', hidden && 'on')}
        aria-pressed={hidden}
        aria-label={hidden ? t('show') : t('hide')}
        title={hidden ? t('show') : t('hide')}
        onClick={() => onHidden(!hidden)}
      >
        {hidden ? <EyeOff size={ICON} /> : <Eye size={ICON} />}
      </Button>
      <Button variant="none" className="draw-btn" aria-label={t('clearAll')} title={t('clearAll')} disabled={!canClear} onClick={onClear}>
        <Trash2 size={ICON} />
      </Button>
    </div>
  );
}
