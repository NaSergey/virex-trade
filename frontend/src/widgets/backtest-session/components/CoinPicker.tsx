'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ListIndentIncrease } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { CoinLogo } from '@/shared/ui/CoinLogo';
import { Input } from '@/shared/ui/Field';
import { useNonPassiveWheel } from '@/shared/lib/hooks/useNonPassiveWheel';

export interface PickerCoin {
  symbol: string;
  base: string;
  /** Оборот за 24 часа в USDT — есть у монет Bybit; у эфира его нет, и строка без числа. */
  turnover24h?: number;
}

/** Оборот коротко, как у биржи: 5.21B, 864.10M, 12.30K. */
function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(0);
}

/**
 * Лицо кнопки выбора монеты: значок списка, логотип и тикер. Отдельно — ради
 * заглушки терминала: она ставит это же лицо невидимым и получает ровно тот
 * же размер (`placeholder` — без запроса картинки).
 */
export function CoinPickerFace({
  symbol,
  base,
  placeholder = false,
}: Omit<PickerCoin, 'turnover24h'> & { placeholder?: boolean }) {
  return (
    <>
      <ListIndentIncrease size={16} className="coin-pick-icon" aria-hidden />
      <CoinLogo base={base} size={20} placeholder={placeholder} />
      <span className="coin-pick-sym">{symbol}</span>
    </>
  );
}

/**
 * Список монет с поиском — меню кнопки монеты графика и кнопки «+» списка монет.
 * Поиск — не украшение: у биржевого терминала в списке все USDT-перпы Bybit,
 * сотни строк. Escape закрывает, Enter берёт первую найденную. Положение меню
 * задаёт родитель (`.coin-menu` стоит под своей кнопкой).
 */
export function CoinMenu({
  coins,
  value,
  onPick,
  onClose,
  className,
}: {
  coins: readonly PickerCoin[];
  /** Отмеченная монета; у «+» списка монет её нет. */
  value?: string;
  onPick: (symbol: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const t = useTranslations('backtest');
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Колесо над меню крутит только список, а не страницу под ним: страница
  // терминала длиннее окна (таблицы под графиком), и меню уезжало под шапку
  // (владелец 2026-11-17: «нельзя скроллить внутри»). Прокрутку ведём сами —
  // нативную гасит preventDefault.
  const scrollList = useCallback((e: WheelEvent) => {
    const list = listRef.current;
    if (!list) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? list.clientHeight : 1;
    list.scrollTop += e.deltaY * unit;
  }, []);
  useNonPassiveWheel(rootRef, scrollList);
  const q = query.trim().toUpperCase();
  const shown = q ? coins.filter((c) => c.symbol.includes(q)) : coins;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && shown[0]) onPick(shown[0].symbol);
  };

  return (
    <div className={cn('coin-menu', className)} ref={rootRef} onKeyDown={onKey}>
      <Input
        full
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('coinSearch')}
        aria-label={t('coinSearch')}
      />
      <div className="coin-menu-list" ref={listRef} role="listbox" aria-label={t('coin')}>
        {shown.map((c) => (
          <Button
            key={c.symbol}
            variant="none"
            role="option"
            aria-selected={c.symbol === value}
            className={cn('coin-menu-row', c.symbol === value && 'on')}
            onClick={() => onPick(c.symbol)}
          >
            <CoinLogo base={c.base} size={18} />
            {c.symbol}
            {c.turnover24h != null && c.turnover24h > 0 && (
              <span className="coin-menu-vol n">{formatVolume(c.turnover24h)}</span>
            )}
          </Button>
        ))}
        {shown.length === 0 && <p className="coin-menu-empty muted">{t('coinNotFound')}</p>}
      </div>
    </div>
  );
}

/** Закрыть меню по нажатию мимо узла `root`. */
export function useOutsideClose(open: boolean, root: { current: HTMLElement | null }, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, root, close]);
}

/**
 * Выбор монеты графика — панелька по образцу Bybit: логотип и тикер, по
 * нажатию — список с поиском (`CoinMenu`).
 *
 * Ширина кнопки постоянная (`.coin-pick-btn`): линейка ТФ справа не ездит ни
 * при смене монеты, ни когда список приходит после заглушки.
 */
export function CoinPicker({
  coins,
  value,
  onChange,
}: {
  coins: readonly PickerCoin[];
  value: string;
  onChange: (symbol: string) => void;
}) {
  const t = useTranslations('backtest');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(open, rootRef, close);

  const current = coins.find((c) => c.symbol === value);
  const pick = (symbol: string) => {
    close();
    if (symbol !== value) onChange(symbol);
  };

  return (
    <div className="coin-pick" ref={rootRef}>
      <Button
        variant="none"
        className="coin-pick-btn"
        aria-label={t('coin')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CoinPickerFace symbol={value} base={current?.base ?? value.replace(/USDT$/, '')} />
      </Button>
      {open && <CoinMenu coins={coins} value={value} onPick={pick} onClose={close} />}
    </div>
  );
}
