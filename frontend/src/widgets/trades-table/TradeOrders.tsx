'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTradeOrders, type Trade, type TradeOrder } from '@/entities/trade';
import { type RuleCompliance } from '@/features/rules';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { KeyValue } from '@/shared/ui/Lookup';
import { Money } from '@/shared/ui/Money';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { useLocaleControl } from '@/shared/i18n';
import { RangeCheckModal } from '@/widgets/range-check-modal';
import { getMetricLabelKey, getUnitTypeForMetric as getUnitType } from '@/features/rules/lib/metric-labels';

/** Время ордера — с секундами: внутри одной позиции ордера идут плотно. */
function fmtOrderTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Маппирование ключей метрик на ключи локализации для подписей. */
function getMetricLabel(metricKey: string, t: (key: string) => string): string {
  const labelKey = getMetricLabelKey(metricKey);
  return t(labelKey);
}

/** Маппирование ключей метрик на типы единиц. */
function getUnitTypeForMetric(metricKey: string): string {
  return getUnitType(metricKey);
}

/** Маппирование типов единиц на ключи локализации. */
function getUnitLabel(unitType: string, t: (key: string) => string): string {
  const unitMap: Record<string, string> = {
    'pct': t('unitPct'),
    'x': t('unitX'),
    'count': t('unitCount'),
  };
  return unitMap[unitType] ?? unitType;
}

function OrderRow({
  order,
  index,
  t,
  entryWord,
  exitWord,
}: {
  order: TradeOrder;
  index: number;
  t: ReturnType<typeof useTranslations<'tradesTable'>>;
  entryWord: string;
  exitWord: string;
}) {
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  /** Ликвидацию/ADL видно только по execType — трейдеру это важнее всего. */
  const note = order.execTypes.includes('BustTrade')
    ? t('liquidation')
    : order.execTypes.includes('AdlTrade')
      ? 'ADL'
      : null;
  return (
    <tr className="order-row-in" style={{ '--i': index } as React.CSSProperties}>
      <td>{order.kind === 'entry' ? entryWord : exitWord}</td>
      <td className="muted">
        {order.side === 'Buy' ? 'buy' : 'sell'}
        {order.fills > 1 && <span className="lbl"> · {t('fillsSuffix', { n: order.fills })}</span>}
        {note && <span className="neg"> · {note}</span>}
      </td>
      {/* Объём деньгами, а не в монете: 47 UNI и 47 SOL — величины, которые
          между собой не сравнить, а USDT сравнимы со всем остальным в журнале.
          Сколько это было монет, говорит подсказка. */}
      <td className="r n" title={t('qtyTitle', { qty: formatQty(order.qty) })}>
        {formatPriceGrouped(order.value)}
      </td>
      <td className="r n">{formatPriceGrouped(order.avgPrice)}</td>
      <td className="r n">{order.pnl == null ? '—' : <Money value={order.pnl} />}</td>
      <td className="n muted">{fmtOrderTime(order.time, intlLocale)}</td>
    </tr>
  );
}

/**
 * Раскрытая запись журнала: слева — из чего позиция собралась (все входы,
 * включая усреднения, и все выходы, включая частичные тейки), справа — каким
 * был рынок на входе.
 *
 * Оба блока отвечают на один вопрос — «что это была за сделка», — поэтому стоят
 * рядом, а не в двух разных местах интерфейса. Проверка диапазона живёт здесь
 * же, а не колонкой таблицы: это инструмент разбора одной сделки, а раскрытая
 * строка и есть её разбор.
 */
export function TradeOrders({
  trade,
  violatedRules,
}: {
  trade: Trade;
  violatedRules?: RuleCompliance[];
}) {
  const t = useTranslations('tradesTable');
  const tr = useTranslations('rules');
  const { locale } = useLocaleControl();
  const { data, isLoading, isError } = useTradeOrders(trade.id);
  const [rangeCheck, setRangeCheck] = useState(false);
  const orders = data?.orders ?? [];
  const ctx = trade.context;

  const TREND_WORDS: Record<string, string> = {
    trend_up: t('trendWordUp'),
    trend_down: t('trendWordDown'),
    range: t('trendWordRange'),
  };
  const entryWord = t('entryWord');
  const exitWord = t('exitWord');

  return (
    <div>
      {/* Раскладка половин — в .order-ctx: доли, переносы и линейка между ними
          держатся вместе, а не половина здесь и половина в стилях. */}
      <div className="order-ctx">
        <div>
          <SectionHead title={t('executionsTitle')} />

          {isLoading ? (
            <SkeletonLines />
          ) : isError ? (
            <p className="neg">{t('ordersLoadFailed')}</p>
          ) : orders.length === 0 ? (
            <p className="muted">{t('noOrdersHistory')}</p>
          ) : (
            <table className="fills" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {orders.map((o, i) => (
                  <OrderRow key={o.orderId} order={o} index={i} t={t} entryWord={entryWord} exitWord={exitWord} />
                ))}
              </tbody>
            </table>
          )}

          {/* Фандинг не входит ни в один ордер: биржа списывает его сама, пока
              позиция висит. В закрытом P&L его тоже нет, поэтому чем дольше
              держали, тем сильнее ордера выше врут о цене сделки. Строка стоит
              под ними, а не сбоку, — это продолжение того же счёта. */}
          {data?.funding && (
            <p className="foot">
              {t('fundingPrefix')} <Money value={data.funding.total} />{' '}
              <span className="muted">({t('fundingPayments', { n: data.funding.payments })})</span>. {t('fundingNote')}
            </p>
          )}
        </div>

        <div>
          {/* Кнопка стоит над теми самыми строками «Диапазон 1H/4H», которые
              и открывает на графике, — а не над исполнениями, к которым она
              отношения не имеет. */}
          <SectionHead title={t('entryContextTitle')}>
            <Button
              variant="bare"
              tight
              className="cue"
              onClick={(e) => {
                e.stopPropagation();
                setRangeCheck(true);
              }}
              title={t('showOnChartTitle')}
            >
              {t('rangeButton')}
            </Button>
          </SectionHead>
          {ctx?.ok ? (
            <>
              <KeyValue label={t('trend4hLabel')}>{TREND_WORDS[ctx.trend4h ?? ''] ?? '—'}</KeyValue>
              <KeyValue label={t('priceToEma')}>
                {ctx.ema200Above == null ? '—' : ctx.ema200Above ? t('above') : t('below')}
              </KeyValue>
              <KeyValue label={t('volatilityAtr')}>
                {ctx.atrPct != null ? `${ctx.atrPct.toFixed(2)} %` : '—'}
              </KeyValue>
              <KeyValue label={t('volumeToMedian')}>
                {ctx.volRel != null ? `×${ctx.volRel.toFixed(2)}` : '—'}
              </KeyValue>
              <KeyValue label={t('colRange', { tf: '1H' })}>{formatRangePos(ctx.rangePos1h, locale)}</KeyValue>
              <KeyValue label={t('colRange', { tf: '4H' })}>{formatRangePos(ctx.rangePos4h, locale)}</KeyValue>
              {ctx.basis === 'closed' && (
                <p className="foot">
                  <b>†</b> {t('entryTimeUnknownNote')}
                </p>
              )}
            </>
          ) : (
            <p className="muted">
              {ctx?.ok === false ? t('notEnoughHistory') : t('contextNotComputed')}
            </p>
          )}
        </div>
      </div>

      {/* Нарушенные правила показываются отдельным блоком ниже деталей входа. */}
      {violatedRules && violatedRules.length > 0 && (
        <div style={{ marginTop: 'var(--s5)' }}>
          <SectionHead title={tr('rulesViolatedTitle')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
            {violatedRules.map((rule) => {
              const value = rule.violatingValues[trade.id];
              const unitType = getUnitTypeForMetric(rule.metric);
              const unit = getUnitLabel(unitType, tr);
              return (
                <div key={rule.metric} className="neg">
                  {tr('violated', {
                    metric: getMetricLabel(rule.metric, tr),
                    value: value != null ? value.toFixed(2) : '?',
                    threshold: rule.threshold,
                    unit,
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rangeCheck && <RangeCheckModal trade={trade} onClose={() => setRangeCheck(false)} />}
    </div>
  );
}
