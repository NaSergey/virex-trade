'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ListIndentIncrease } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { CoinLogo } from '@/shared/ui/CoinLogo';
import { Input } from '@/shared/ui/Field';

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
 * Выбор монеты графика — панелька по образцу Bybit: логотип и тикер, по
 * нажатию — список с поиском. Поиск — не украшение: у биржевого терминала в
 * списке все USDT-перпы Bybit, сотни строк, а прежний select хотя бы
 * перескакивал по первой букве.
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
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const current = coins.find((c) => c.symbol === value);
  const q = query.trim().toUpperCase();
  const shown = q ? coins.filter((c) => c.symbol.includes(q)) : coins;

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (symbol: string) => {
    close();
    if (symbol !== value) onChange(symbol);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && shown[0]) pick(shown[0].symbol);
  };

  return (
    <div className="coin-pick" ref={rootRef} onKeyDown={onKey}>
      <Button
        variant="none"
        className="coin-pick-btn"
        aria-label={t('coin')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <CoinPickerFace symbol={value} base={current?.base ?? value.replace(/USDT$/, '')} />
      </Button>
      {open && (
        <div className="coin-menu">
          <Input
            full
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('coinSearch')}
            aria-label={t('coinSearch')}
          />
          <div className="coin-menu-list" role="listbox" aria-label={t('coin')}>
            {shown.map((c) => (
              <Button
                key={c.symbol}
                variant="none"
                role="option"
                aria-selected={c.symbol === value}
                className={cn('coin-menu-row', c.symbol === value && 'on')}
                onClick={() => pick(c.symbol)}
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
      )}
    </div>
  );
}
