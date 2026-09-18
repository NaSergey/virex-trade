'use client';

import { useTranslations } from 'next-intl';
import { Pencil, Tag as TagIcon, Target, Zap } from 'lucide-react';
import type { ExchangePosition } from '@/entities/position';
import { Tags } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import type { LedgerColumn } from '@/shared/ui/LedgerTable';
import { Tooltip } from '@/shared/ui/Tooltip';
import { PositionsTable } from '@/widgets/positions-table';
import { durationUnitLabels } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { liquidationPrice, toScreen, unrealizedPnl } from '../lib/money';

/** В полтора раза крупнее прежних 14: по этим кнопкам целятся в терминале. */
const ICON_SIZE = 21;

/** Сессия идёт по одному инструменту — по BTC (см. StartSession). */
const SESSION_SYMBOL = 'BTCUSDT';

/** Время в позиции — по симулированному моменту сессии (`cursor`), не по настоящим часам.
 * Тот же приём отказа, что у `fmtAge` в `views/overview/components/OpenPositions.tsx`:
 * «—» на некорректном значении, а не молчаливое зажатие в 0 — вход позже курсора
 * сигнализирует баг в другом месте, и прятать его не нужно. */
function fmtSimAge(entryTime: string, cursor: number, units: { d: string; h: string; m: string }): string {
  const min = Math.floor((cursor - Date.parse(entryTime)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d} ${units.d} ${h} ${units.h}`;
  return h > 0 ? `${h} ${units.h} ${String(min % 60).padStart(2, '0')} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Открытые позиции сессии — до двух, лонг и шорт разом (хедж). Ещё не
 * сработавшие ордера (сетка на вход, лимиты закрытия) сюда не входят — у них
 * своя вкладка («Ордера», см. OrdersPanel): до срабатывания это не позиция.
 *
 * Таблица — та же `PositionsTable`, что рисует «Открытые позиции — сейчас» на
 * обзоре: сделка сессии переводится в ту же форму (`ExchangePosition`), и
 * колонки берутся оттуда целиком, а не повторяются здесь. Бектест добавляет
 * ровно одно — колонку действий: уровни и закрытия. В живой торговле их нет,
 * потому что позицией там распоряжается биржа.
 *
 * «Вход в диапазоне» не передаётся: это снимок живого рынка с отдельного
 * эндпоинта, и для симулированного момента истории его неоткуда взять —
 * колонка в таком случае не рисуется вовсе (см. renderRange).
 */
export function OpenPositionsPanel({
  trades,
  scale,
  price,
  cursor,
  onLimit,
  onMarket,
  onChangeLevels,
  onTags,
}: {
  trades: BacktestTrade[];
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  /** Момент симуляции — для «В позиции». */
  cursor: number;
  onLimit: (trade: BacktestTrade) => void;
  onMarket: (trade: BacktestTrade) => void;
  onChangeLevels: (trade: BacktestTrade) => void;
  onTags: (trade: BacktestTrade) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const units = durationUnitLabels(locale);

  if (trades.length === 0) {
    return <EmptyState title={t('noOpenPosition')}>{t('noOpenPositionHint')}</EmptyState>;
  }

  // Ключ строки в PositionsTable — символ и направление: с хеджем этого хватает,
  // лонг и шорт по одному инструменту у сессии не повторяются.
  const byKey = new Map<string, BacktestTrade>();
  const positions: ExchangePosition[] = trades.map((trade) => {
    const remaining = trade.qty - trade.closedQty;
    const entry = toScreen(trade.entryPrice, scale);
    byKey.set(`${SESSION_SYMBOL}-${trade.direction}`, trade);
    return {
      symbol: SESSION_SYMBOL,
      direction: trade.direction,
      size: String(remaining),
      avgPrice: String(entry),
      markPrice: price != null ? String(toScreen(price, scale)) : undefined,
      positionValue: String(remaining * entry),
      unrealisedPnl: price != null ? String(unrealizedPnl(trade.direction, trade.entryPrice, price, remaining)) : undefined,
      leverage: String(trade.leverage),
      liqPrice: String(toScreen(liquidationPrice(trade.direction, trade.entryPrice, trade.leverage), scale)),
    };
  });
  const tradeOf = (p: ExchangePosition) => byKey.get(`${p.symbol}-${p.direction}`)!;

  const totalPnl =
    price != null
      ? trades.reduce((s, x) => s + unrealizedPnl(x.direction, x.entryPrice, price, x.qty - x.closedQty), 0)
      : null;

  const actions: LedgerColumn<ExchangePosition>[] = [
    {
      key: 'actions',
      render: (p) => {
        const trade = tradeOf(p);
        return (
          <span className="row-actions">
            <Tooltip text={t('changeLevels')}>
              <Button tight aria-label={t('changeLevels')} onClick={() => onChangeLevels(trade)}>
                <Pencil size={ICON_SIZE} />
              </Button>
            </Tooltip>
            <Tooltip text={t('limitClose')}>
              <Button tight aria-label={t('limitClose')} onClick={() => onLimit(trade)}>
                <Target size={ICON_SIZE} />
              </Button>
            </Tooltip>
            <Tooltip text={t('marketClose')}>
              <Button tight variant="risk" aria-label={t('marketClose')} onClick={() => onMarket(trade)}>
                <Zap size={ICON_SIZE} />
              </Button>
            </Tooltip>
          </span>
        );
      },
    },
  ];

  return (
    <PositionsTable
      positions={positions}
      title={t('openPositionsTitle')}
      totalPnl={totalPnl}
      renderAge={(p) => <span className="muted">{fmtSimAge(tradeOf(p).entryTime, cursor, units)}</span>}
      renderTags={(p) => {
        const trade = tradeOf(p);
        return (
          <Tags tags={trade.tags}>
            <Tooltip text={t('addTag')}>
              <Button variant="add" tight aria-label={t('addTag')} onClick={() => onTags(trade)}>
                <TagIcon size={ICON_SIZE} />
              </Button>
            </Tooltip>
          </Tags>
        );
      }}
      extraColumns={actions}
      flush
    />
  );
}
