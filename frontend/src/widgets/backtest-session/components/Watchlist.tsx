'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { Button } from '@/shared/ui/Button';
import { CoinLogo } from '@/shared/ui/CoinLogo';
import { watchAdd, watchDefaults, watchRemove, watchShown } from '../lib/watchlist';
import type { LiveSource } from '../model/useLiveFeed';
import { CoinMenu, useOutsideClose, type PickerCoin } from './CoinPicker';

/** Как часто обновлять цены списка: столько же, сколько хвост графика. */
const POLL_MS = 2000;

/** Список хранится строкой через запятую: в тикерах запятых не бывает, а хранилище берёт только строки. */
const decodeList = (raw: string | null) => raw;
const encodeList = (v: string | null) => v;

const pctText = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;

/**
 * Список монет справа от графика, как у TradingView: цена и изменение за сутки,
 * нажатие — монета на графике. Состав — на устройстве и отдельно по рынку
 * (`source.kind`): у биржи и эфира монеты разные.
 *
 * Цены опрашивает сам список, а не терминал: приход раз в 2 с перерисовывает
 * только его. Пока список не на экране, компонента нет — и опроса тоже; у фоновой
 * вкладки опрос стоит.
 */
export function Watchlist({
  coins,
  value,
  source,
  decimalsOf,
  onPick,
}: {
  coins: readonly PickerCoin[];
  /** Монета графика — её строка выделена. */
  value: string;
  source: NonNullable<LiveSource['tickers']>;
  decimalsOf: (symbol: string) => number | undefined;
  onPick: (symbol: string) => void;
}) {
  const t = useTranslations('backtest');
  const all = useMemo(() => coins.map((c) => c.symbol), [coins]);
  const [saved, setSaved] = usePersistentValue<string | null>(
    `virex.terminal.watchlist.${source.kind}`,
    decodeList,
    null,
    encodeList,
  );
  const list = watchShown(saved != null ? saved.split(',').filter(Boolean) : watchDefaults(all, source.kind), all);
  const save = (next: string[]) => setSaved(next.join(','));

  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const closeAdd = useCallback(() => setAdding(false), []);
  useOutsideClose(adding, addRef, closeAdd);

  const { data } = useQuery({
    queryKey: ['market', 'tickers', source.kind],
    queryFn: source.fetch,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const bySymbol = useMemo(() => new Map((data ?? []).map((x) => [x.symbol, x])), [data]);
  const baseOf = useMemo(() => new Map(coins.map((c) => [c.symbol, c.base])), [coins]);

  return (
    <section className="watch" aria-label={t('watch.title')}>
      <div className="watch-head">
        <span className="watch-title">{t('watch.title')}</span>
        <div className="watch-add" ref={addRef}>
          <Button
            variant="bare"
            tight
            aria-label={t('watch.add')}
            title={t('watch.add')}
            aria-expanded={adding}
            onClick={() => setAdding((v) => !v)}
          >
            <Plus size={16} />
          </Button>
          {adding && (
            <CoinMenu
              className="watch-menu"
              coins={coins}
              onPick={(symbol) => {
                save(watchAdd(list, symbol));
                closeAdd();
              }}
              onClose={closeAdd}
            />
          )}
        </div>
      </div>
      <div className="watch-cols muted" aria-hidden>
        <span>{t('watch.symbol')}</span>
        <span>{t('watch.last')}</span>
        <span>{t('watch.change')}</span>
      </div>
      <div className="watch-list">
        {list.map((symbol) => {
          const tick = bySymbol.get(symbol);
          const base = baseOf.get(symbol) ?? symbol.replace(/USDT$/, '');
          return (
            <div key={symbol} className={cn('watch-row', symbol === value && 'on')}>
              <Button variant="none" className="watch-pick" aria-current={symbol === value} onClick={() => onPick(symbol)}>
                <span className="watch-sym">
                  <CoinLogo base={base} size={18} />
                  {base}
                </span>
                <span className="watch-last n">{tick ? formatPriceGrouped(tick.last, decimalsOf(symbol)) : '—'}</span>
                <span className={cn('watch-chg n', tick && (tick.change24h >= 0 ? 'pos' : 'neg'))}>
                  {tick ? pctText(tick.change24h) : '—'}
                </span>
              </Button>
              <Button
                variant="bare"
                tight
                className="watch-x"
                aria-label={`${t('watch.remove')}: ${base}`}
                title={t('watch.remove')}
                onClick={() => save(watchRemove(list, symbol))}
              >
                <X size={14} />
              </Button>
            </div>
          );
        })}
        {list.length === 0 && <p className="watch-empty muted">{t('watch.empty')}</p>}
      </div>
    </section>
  );
}
