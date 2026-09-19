'use client';

import { useTranslations } from 'next-intl';
import { KeyValue } from '@/shared/ui/Lookup';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { durationUnitLabels, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import { useLocaleControl } from '@/shared/i18n';
import type { BacktestTrade } from '../api/types';
import { formatR, toScreen } from '../lib/money';

/** Сколько сделка держалась — тем же счётом, что и «В позиции» в строке журнала. */
function fmtHold(entryTime: string, exitTime: string | null, units: { d: string; h: string; m: string }): string {
  if (!exitTime) return '—';
  const min = Math.floor((Date.parse(exitTime) - Date.parse(entryTime)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} ${units.d} ${h} ${units.h} ${m} ${units.m}`;
  return h > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Раскрытая запись журнала бектеста — разбор одной сделки.
 *
 * Стоит на месте `TradeOrders` обзора и отвечает на тот же вопрос — «что это
 * была за сделка», — но другими числами: ордеров исполнения и рыночного
 * контекста у симуляции нет, зато есть то, чего не знает биржа, — план входа.
 * Слева то, с чем в сделку заходили (уровни, размер, плечо, заявленный риск),
 * справа — чем она кончилась (выход, R, комиссия, результат).
 *
 * Здесь же живут R и «Выход по»: в строке журнала их нет намеренно — колонки
 * там ровно те же, что на обзоре.
 */
export function TradeDetails({
  trade,
  scale,
  labelFor,
}: {
  trade: BacktestTrade;
  /** Масштаб показа; у завершённой сессии — 1, цены раскрыты. */
  scale: number;
  labelFor: (ms: number) => string;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const units = durationUnitLabels(locale);
  const price = (p: number) => formatPriceGrouped(toScreen(p, scale));

  return (
    <div className="order-ctx">
      <div>
        <SectionHead title={t('tradePlanTitle')} />
        <KeyValue label={t('colEntry')}>
          {price(trade.entryPrice)} <span className="muted">· {labelFor(Date.parse(trade.entryTime))}</span>
        </KeyValue>
        <KeyValue label={t('stopLabel')}>{price(trade.stopLoss)}</KeyValue>
        <KeyValue label={t('takeLabel')}>{trade.takeProfit != null ? price(trade.takeProfit) : '—'}</KeyValue>
        <KeyValue label={t('riskPlanned')}>
          {trade.riskPct.toFixed(2)} % <span className="muted">· {formatPriceGrouped(trade.riskUsdt)} USDT</span>
        </KeyValue>
        <KeyValue label={t('colSize')}>
          {formatPriceGrouped(trade.qty * toScreen(trade.entryPrice, scale))}{' '}
          <span className="muted">· {t('qtyTitle', { qty: formatQty(trade.qty) })}</span>
        </KeyValue>
        <KeyValue label={t('leverageLabel')}>{trade.leverage.toFixed(0)}×</KeyValue>
      </div>

      <div>
        <SectionHead title={t('tradeResultTitle')} />
        <KeyValue label={t('colExit')}>
          {trade.exitPrice != null ? price(trade.exitPrice) : '—'}
          {trade.exitTime && <span className="muted"> · {labelFor(Date.parse(trade.exitTime))}</span>}
        </KeyValue>
        <KeyValue label={t('colReason')}>{t(`reason.${trade.exitReason ?? 'open'}`)}</KeyValue>
        <KeyValue label={t('colInPosition')}>{fmtHold(trade.entryTime, trade.exitTime, units)}</KeyValue>
        <KeyValue label={t('colR')}>
          {trade.r != null ? <span className={trade.r >= 0 ? 'pos' : 'neg'}>{formatR(trade.r)}</span> : '—'}
        </KeyValue>
        <KeyValue label={t('feeLabel')}>{trade.fee != null ? formatPriceGrouped(trade.fee) : '—'}</KeyValue>
        <KeyValue label={t('colPnl')}>{trade.pnl != null ? <Money value={trade.pnl} /> : '—'}</KeyValue>
      </div>
    </div>
  );
}
