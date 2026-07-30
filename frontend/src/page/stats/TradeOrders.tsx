'use client';

import { useState } from 'react';
import { useTradeOrders, type Trade, type TradeOrder } from '@/shared/api/bybit/hooks';
import { formatMoney, formatPriceGrouped, moneyClass } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { RangeCheckModal } from '@/page/stats/RangeCheckModal';

const TREND_WORDS: Record<string, string> = {
  trend_up: 'восходящий',
  trend_down: 'нисходящий',
  range: 'боковик',
};

/** Время ордера — с секундами: внутри одной позиции ордера идут плотно. */
function fmtOrderTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Ликвидацию/ADL видно только по execType — трейдеру это важнее всего. */
function execTypeLabel(types: string[]): string | null {
  if (types.includes('BustTrade')) return 'ликвидация';
  if (types.includes('AdlTrade')) return 'ADL';
  return null;
}

function OrderRow({ order, index }: { order: TradeOrder; index: number }) {
  const note = execTypeLabel(order.execTypes);
  return (
    <tr className="order-row-in" style={{ '--i': index } as React.CSSProperties}>
      <td>{order.kind === 'entry' ? 'вход' : 'выход'}</td>
      <td style={{ color: 'var(--color-muted)' }}>
        {order.side === 'Buy' ? 'buy' : 'sell'}
        {order.fills > 1 && <span className="lbl"> · {order.fills} исп.</span>}
        {note && <span className="neg"> · {note}</span>}
      </td>
      <td className="r n">{order.qty}</td>
      <td className="r n">{formatPriceGrouped(order.avgPrice)}</td>
      <td className={`r n ${order.pnl == null ? '' : moneyClass(order.pnl)}`}>
        {order.pnl == null ? '—' : formatMoney(order.pnl)}
      </td>
      <td className="n" style={{ color: 'var(--color-muted)' }}>
        {fmtOrderTime(order.time)}
      </td>
    </tr>
  );
}

/** Одна пара «что было на рынке → значение». */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span className="n">{value}</span>
    </div>
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
export function TradeOrders({ trade }: { trade: Trade }) {
  const { data, isLoading, isError } = useTradeOrders(trade.id);
  const [rangeCheck, setRangeCheck] = useState(false);
  const orders = data?.orders ?? [];
  const ctx = trade.context;

  return (
    <div className="row-reveal">
      <div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--s4)',
            padding: 'var(--s3) 0',
          }}
        >
          <div>
            <div className="h2row" style={{ marginBottom: 'var(--s2)' }}>
              <h2>Исполнения</h2>
              <button
                className="btn bare"
                onClick={(e) => {
                  e.stopPropagation();
                  setRangeCheck(true);
                }}
                title="Показать на графике, где был вход внутри диапазона таймфрейма"
              >
                Проверить диапазон
              </button>
            </div>

            {isLoading ? (
              <>
                <div className="skel" />
                <div className="skel" style={{ width: '78%' }} />
                <div className="skel" style={{ width: '56%' }} />
              </>
            ) : isError ? (
              <p className="neg">Не удалось загрузить ордера</p>
            ) : orders.length === 0 ? (
              <p style={{ color: 'var(--color-muted)' }}>
                История исполнений по этой сделке не сохранена — синхронизируйте сделки заново.
              </p>
            ) : (
              <table className="fills" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {orders.map((o, i) => (
                    <OrderRow key={o.orderId} order={o} index={i} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <div className="h2row" style={{ marginBottom: 'var(--s2)' }}>
              <h2>Контекст входа</h2>
            </div>
            {ctx?.ok ? (
              <>
                <Fact label="Тренд 4H" value={TREND_WORDS[ctx.trend4h ?? ''] ?? '—'} />
                <Fact
                  label="Цена к EMA200"
                  value={ctx.ema200Above == null ? '—' : ctx.ema200Above ? 'выше' : 'ниже'}
                />
                <Fact label="Волатильность (ATR)" value={ctx.atrPct != null ? `${ctx.atrPct.toFixed(2)} %` : '—'} />
                <Fact label="Объём к медиане" value={ctx.volRel != null ? `×${ctx.volRel.toFixed(2)}` : '—'} />
                <Fact label="Диапазон 1H" value={formatRangePos(ctx.rangePos1h)} />
                <Fact label="Диапазон 4H" value={formatRangePos(ctx.rangePos4h)} />
                {ctx.basis === 'closed' && (
                  <p className="foot">
                    <b>†</b> Время входа неизвестно — снимок привязан к закрытию сделки.
                  </p>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--color-muted)' }}>
                {ctx?.ok === false
                  ? 'У символа не хватило истории свечей — контекст этой сделки не посчитан.'
                  : 'Контекст этой сделки пока не посчитан.'}
              </p>
            )}
          </div>
        </div>

        {rangeCheck && <RangeCheckModal trade={trade} onClose={() => setRangeCheck(false)} />}
      </div>
    </div>
  );
}
