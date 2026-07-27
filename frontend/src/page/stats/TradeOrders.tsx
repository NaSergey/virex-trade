'use client';

import { useTradeOrders, type Trade, type TradeOrder } from '@/shared/api/bybit/hooks';
import { formatPnl, formatPrice, pnlColor } from '@/shared/lib/utils/format';

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

/**
 * Скелетон вместо строки «Загрузка…»: держит примерную высоту блока, поэтому
 * появление реальных ордеров не дёргает высоту раскрытой строки.
 */
function OrdersSkeleton() {
  return (
    <div className="space-y-2 py-1.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 pl-3">
          {[44, 34, 40, 56, 48, 40, 44, 80].map((w, j) => (
            <div
              key={j}
              className="h-2.5 animate-pulse rounded-sm bg-line"
              style={{ width: w, animationDelay: `${(i * 8 + j) * 18}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function OrderRow({ order, index }: { order: TradeOrder; index: number }) {
  const isEntry = order.kind === 'entry';
  const note = execTypeLabel(order.execTypes);
  return (
    <tr
      className="order-row-in border-t border-line/60 transition-colors hover:bg-fg/4"
      style={{ '--i': index } as React.CSSProperties}
    >
      <td className="py-1.5 pl-3">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
            isEntry ? 'bg-fg/10 text-fg' : 'bg-muted/15 text-muted'
          }`}
        >
          {isEntry ? 'вход' : 'выход'}
        </span>
      </td>
      <td className={`py-1.5 font-medium ${order.side === 'Buy' ? 'text-up' : 'text-down'}`}>{order.side}</td>
      <td className="py-1.5 font-mono text-fg">{order.qty}</td>
      <td className="py-1.5 font-mono text-fg">{formatPrice(order.avgPrice)}</td>
      <td className="py-1.5 font-mono text-muted">{order.value.toFixed(2)}</td>
      <td className={`py-1.5 font-mono ${order.pnl == null ? 'text-subtle' : pnlColor(order.pnl)}`}>
        {order.pnl == null ? '—' : formatPnl(order.pnl)}
      </td>
      <td className="py-1.5 font-mono text-subtle">{order.fee == null ? '—' : order.fee.toFixed(4)}</td>
      <td className="py-1.5 text-muted">
        {fmtOrderTime(order.time)}
        {order.fills > 1 && <span className="ml-1.5 text-subtle">· {order.fills} исп.</span>}
        {note && <span className="ml-1.5 font-medium text-down">· {note}</span>}
      </td>
      <td className="py-1.5 pr-3 font-mono text-[10px] text-subtle" title={order.orderId}>
        {order.orderId.slice(0, 8)}
      </td>
    </tr>
  );
}

/**
 * Раскрытая строка таблицы сделок: все ордера позиции — и входы (усреднения),
 * и выходы (частичные тейки), в хронологическом порядке. Таблица сделок
 * показывает позицию целиком, а здесь видно, из чего она собралась.
 */
export function TradeOrders({ trade }: { trade: Trade }) {
  const { data, isLoading, isError } = useTradeOrders(trade.id);
  const orders = data?.orders ?? [];

  const entries = orders.filter((o) => o.kind === 'entry');
  const exits = orders.filter((o) => o.kind === 'exit');

  return (
    <div className="border-y border-line bg-elevated/40 px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline gap-3 text-[10px] tracking-wide text-subtle uppercase">
        <span>Ордера позиции</span>
        {orders.length > 0 && (
          <span className="font-mono text-muted normal-case">
            {entries.length} вход{entries.length === 1 ? '' : 'ов'} / {exits.length} выход
            {exits.length === 1 ? '' : 'ов'}
          </span>
        )}
      </div>

      {isLoading ? (
        <OrdersSkeleton />
      ) : isError ? (
        <div className="py-2 text-xs text-down">Не удалось загрузить ордера</div>
      ) : orders.length === 0 ? (
        <div className="py-2 text-xs text-muted">
          История исполнений по этой сделке не сохранена — синхронизируйте сделки заново.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] tracking-wide text-subtle uppercase">
                <th className="pb-1 pl-3 text-left font-medium">Тип</th>
                <th className="pb-1 text-left font-medium">Сторона</th>
                <th className="pb-1 text-left font-medium">Кол-во</th>
                <th className="pb-1 text-left font-medium">Цена</th>
                <th className="pb-1 text-left font-medium">Объём</th>
                <th className="pb-1 text-left font-medium">P&amp;L</th>
                <th className="pb-1 text-left font-medium">Комиссия</th>
                <th className="pb-1 text-left font-medium">Время</th>
                <th className="pb-1 pr-3 text-left font-medium">Ордер</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <OrderRow key={o.orderId} order={o} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
