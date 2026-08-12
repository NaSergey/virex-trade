'use client';

import { useState } from 'react';
import { useTradeOrders, type Trade, type TradeOrder } from '@/entities/trade';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { KeyValue } from '@/shared/ui/Lookup';
import { Money } from '@/shared/ui/Money';
import { formatPriceGrouped, formatQty, plural } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { RangeCheckModal } from '@/widgets/range-check-modal';

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
      <td className="muted">
        {order.side === 'Buy' ? 'buy' : 'sell'}
        {order.fills > 1 && <span className="lbl"> · {order.fills} исп.</span>}
        {note && <span className="neg"> · {note}</span>}
      </td>
      {/* Объём деньгами, а не в монете: 47 UNI и 47 SOL — величины, которые
          между собой не сравнить, а USDT сравнимы со всем остальным в журнале.
          Сколько это было монет, говорит подсказка. */}
      <td className="r n" title={`${formatQty(order.qty)} в монете`}>
        {formatPriceGrouped(order.value)}
      </td>
      <td className="r n">{formatPriceGrouped(order.avgPrice)}</td>
      <td className="r n">{order.pnl == null ? '—' : <Money value={order.pnl} />}</td>
      <td className="n muted">{fmtOrderTime(order.time)}</td>
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
export function TradeOrders({ trade }: { trade: Trade }) {
  const { data, isLoading, isError } = useTradeOrders(trade.id);
  const [rangeCheck, setRangeCheck] = useState(false);
  const orders = data?.orders ?? [];
  const ctx = trade.context;

  return (
    <div>
      {/* Раскладка половин — в .order-ctx: доли, переносы и линейка между ними
          держатся вместе, а не половина здесь и половина в стилях. */}
      <div className="order-ctx">
        <div>
          <SectionHead title="Исполнения" />

          {isLoading ? (
            <SkeletonLines />
          ) : isError ? (
            <p className="neg">Не удалось загрузить ордера</p>
          ) : orders.length === 0 ? (
            <p className="muted">
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

          {/* Фандинг не входит ни в один ордер: биржа списывает его сама, пока
              позиция висит. В закрытом P&L его тоже нет, поэтому чем дольше
              держали, тем сильнее ордера выше врут о цене сделки. Строка стоит
              под ними, а не сбоку, — это продолжение того же счёта. */}
          {data?.funding && (
            <p className="foot">
              Фандинг за время удержания: <Money value={data.funding.total} />{' '}
              <span className="muted">
                ({data.funding.payments}{' '}
                {plural(data.funding.payments, 'списание', 'списания', 'списаний')})
              </span>
              . В P&L сделки он не входит.
            </p>
          )}
        </div>

        <div>
          {/* Кнопка стоит над теми самыми строками «Диапазон 1H/4H», которые
              и открывает на графике, — а не над исполнениями, к которым она
              отношения не имеет. */}
          <SectionHead title="Контекст входа">
            <Button
              variant="bare"
              tight
              className="cue"
              onClick={(e) => {
                e.stopPropagation();
                setRangeCheck(true);
              }}
              title="Показать на графике, где был вход внутри диапазона таймфрейма"
            >
              Диапазон
            </Button>
          </SectionHead>
          {ctx?.ok ? (
            <>
              <KeyValue label="Тренд 4H">{TREND_WORDS[ctx.trend4h ?? ''] ?? '—'}</KeyValue>
              <KeyValue label="Цена к EMA200">
                {ctx.ema200Above == null ? '—' : ctx.ema200Above ? 'выше' : 'ниже'}
              </KeyValue>
              <KeyValue label="Волатильность (ATR)">
                {ctx.atrPct != null ? `${ctx.atrPct.toFixed(2)} %` : '—'}
              </KeyValue>
              <KeyValue label="Объём к медиане">
                {ctx.volRel != null ? `×${ctx.volRel.toFixed(2)}` : '—'}
              </KeyValue>
              <KeyValue label="Диапазон 1H">{formatRangePos(ctx.rangePos1h)}</KeyValue>
              <KeyValue label="Диапазон 4H">{formatRangePos(ctx.rangePos4h)}</KeyValue>
              {ctx.basis === 'closed' && (
                <p className="foot">
                  <b>†</b> Время входа неизвестно — снимок привязан к закрытию сделки.
                </p>
              )}
            </>
          ) : (
            <p className="muted">
              {ctx?.ok === false
                ? 'У символа не хватило истории свечей — контекст этой сделки не посчитан.'
                : 'Контекст этой сделки пока не посчитан.'}
            </p>
          )}
        </div>
      </div>

      {rangeCheck && <RangeCheckModal trade={trade} onClose={() => setRangeCheck(false)} />}
    </div>
  );
}
