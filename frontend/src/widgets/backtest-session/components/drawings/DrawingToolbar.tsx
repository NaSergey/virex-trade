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
  Keyboard,
  Magnet,
  Minus,
  MoveDiagonal,
  MoveUpRight,
  Plus,
  Ruler,
  RulerDimensionLine,
  Square,
  SeparatorVertical,
  Slash,
  TrendingDown,
  TrendingUp,
  Trash2,
  Type,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils/css';
import { TOOL_KEYS, toolShortcut } from '../../lib/drawings/hotkeys';
import type { ToolId } from '../../lib/drawings/types';
import { ChannelIcon, FibIcon, HRayIcon } from './FibIcon';

const ICON = 16;

type Icon = ComponentType<{ size?: number }>;

const TOOL_ICON: Record<ToolId, Icon> = {
  trend: Slash,
  ray: MoveUpRight,
  extended: MoveDiagonal,
  hline: Minus,
  hray: HRayIcon,
  vline: SeparatorVertical,
  cross: Plus,
  channel: ChannelIcon,
  arrow: ArrowUpRight,
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  fib: FibIcon,
  long: TrendingUp,
  short: TrendingDown,
  range: RulerDimensionLine,
  brush: Brush,
  rect: Square,
  text: Type,
  ruler: Ruler,
};

/**
 * Кнопка панели — группа инструментов; у группы из одного выпадающего списка нет.
 * Состав групп — как у TradingView: линии с каналом, Фибоначчи, прогнозы и
 * измерения, фигуры, стрелки, текст.
 */
const GROUPS: ToolId[][] = [
  ['trend', 'ray', 'extended', 'hline', 'hray', 'vline', 'cross', 'channel'],
  ['fib'],
  ['long', 'short', 'range'],
  ['brush', 'rect'],
  ['arrow', 'arrowUp', 'arrowDown'],
  ['text'],
  ['ruler'],
];

/** Подсказка с клавишей: «Линия (Alt+T)». */
const withKey = (label: string, key: string | null) => (key ? `${label} (${key})` : label);

/** Клавиши без инструмента — для шпаргалки. Инструменты берутся из `TOOL_KEYS`. */
const GENERAL_KEYS = [
  [null, 'measure'],
  ['Shift', 'level'],
  ['Ctrl / ⌘', 'magnetHold'],
  ['Ctrl+Z', 'undo'],
  ['Ctrl+Y', 'redo'],
  ['Ctrl+C, Ctrl+V', 'clone'],
  ['Delete', 'delete'],
  ['Ctrl+Alt+H', 'hideAll'],
  ['Alt+R', 'resetChart'],
  ['Esc', 'cancel'],
] as const;

/** Номер «группы» шпаргалки в общем состоянии открытого списка. */
const KEYS_MENU = -1;

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
              aria-keyshortcuts={toolShortcut(current) ?? undefined}
              title={withKey(t(`tool.${current}`), toolShortcut(current))}
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
                      {toolShortcut(id) && <kbd className="draw-kbd">{toolShortcut(id)}</kbd>}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <span className="draw-sep" />
      <Button
        variant="none"
        className={cn('draw-btn', magnet && 'on')}
        aria-pressed={magnet}
        aria-label={t('magnet')}
        title={withKey(t('magnet'), t('magnetHint'))}
        onClick={() => onMagnet(!magnet)}
      >
        <Magnet size={ICON} />
      </Button>
      <Button
        variant="none"
        className={cn('draw-btn', hidden && 'on')}
        aria-pressed={hidden}
        aria-label={hidden ? t('show') : t('hide')}
        title={withKey(hidden ? t('show') : t('hide'), 'Ctrl+Alt+H')}
        onClick={() => onHidden(!hidden)}
      >
        {hidden ? <EyeOff size={ICON} /> : <Eye size={ICON} />}
      </Button>
      <Button variant="none" className="draw-btn" aria-label={t('clearAll')} title={t('clearAll')} disabled={!canClear} onClick={onClear}>
        <Trash2 size={ICON} />
      </Button>
      <div className="draw-group static">
        <Button
          variant="none"
          className={cn('draw-btn', open === KEYS_MENU && 'on')}
          aria-label={t('keys.title')}
          title={t('keys.title')}
          aria-haspopup="dialog"
          aria-expanded={open === KEYS_MENU}
          onClick={() => setOpen(open === KEYS_MENU ? null : KEYS_MENU)}
        >
          <Keyboard size={ICON} />
        </Button>
        {open === KEYS_MENU && (
          <div className="draw-menu draw-keys" role="dialog" aria-label={t('keys.title')}>
            {(Object.keys(TOOL_KEYS) as ToolId[]).map((id) => (
              <div key={id} className="draw-keys-row">
                <span>{t(`tool.${id}`)}</span>
                <kbd className="draw-kbd">{toolShortcut(id)}</kbd>
              </div>
            ))}
            {GENERAL_KEYS.map(([key, id]) => (
              <div key={id} className="draw-keys-row">
                <span>{t(`keys.${id}`)}</span>
                <kbd className="draw-kbd">{key ?? t('keys.shiftClick')}</kbd>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
