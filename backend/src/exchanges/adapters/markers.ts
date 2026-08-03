import { ExecMarker, Fill } from '../exchange.types';

/**
 * Collapse fills into one chart marker per order.
 *
 * A grid entry or a laddered exit is many fills of the same order; drawing each
 * one buries the chart in markers that all sit at the same spot. Price becomes
 * the value-weighted average, time the last fill, and the marker counts as a
 * close if any of its fills reduced the position.
 *
 * Shared by every adapter — the aggregation is exchange-independent once fills
 * are normalized.
 */
export function markersFromFills(fills: Fill[]): ExecMarker[] {
  const byOrder = new Map<
    string,
    { time: number; valueSum: number; qty: number; side: 'Buy' | 'Sell'; isClose: boolean }
  >();

  for (const f of fills) {
    if (!f.orderId || !(f.qty > 0)) continue;
    const time = Math.floor(f.execTime.getTime() / 1000); // chart wants seconds
    if (!Number.isFinite(time)) continue;
    const closed = f.closedSize > 0;
    const acc = byOrder.get(f.orderId);
    if (acc) {
      acc.valueSum += f.price * f.qty;
      acc.qty += f.qty;
      acc.time = Math.max(acc.time, time);
      acc.isClose = acc.isClose || closed;
    } else {
      byOrder.set(f.orderId, {
        time,
        valueSum: f.price * f.qty,
        qty: f.qty,
        side: f.side,
        isClose: closed,
      });
    }
  }

  const markers: ExecMarker[] = [];
  for (const [orderId, a] of byOrder) {
    markers.push({
      orderId,
      time: a.time,
      price: a.qty > 0 ? a.valueSum / a.qty : 0,
      side: a.side,
      qty: a.qty,
      isClose: a.isClose,
    });
  }
  markers.sort((x, y) => x.time - y.time);
  return markers;
}
