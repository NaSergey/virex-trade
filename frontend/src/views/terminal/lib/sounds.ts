import type { TerminalSound } from '@/widgets/backtest-session';
import { positionKey, type TerminalPosition, type TerminalState } from '../api/types';

/** Что из снимка счёта нужно, чтобы вывести сигналы. */
export type Snapshot = Pick<TerminalState, 'positions' | 'orders'>;

/** Порядок в одном снимке: сначала то, что важнее, — как в терминале бектеста. */
const PRIORITY: readonly TerminalSound[] = ['stop', 'take', 'fill', 'placed', 'cancel'];

/**
 * Насколько близко к уровню должна была стоять цена в последнем снимке, чтобы
 * закрытие считалось его срабатыванием. Счёт опрашивается раз в три секунды, и
 * за это время цена успевает отойти от уровня; полпроцента покрывают обычный
 * ход, а не покрытое просто прозвучит нейтрально.
 */
const NEAR = 0.005;

/**
 * Чем закрылась позиция, пропавшая из снимка. Биржа причину не называет —
 * позиции просто больше нет, — поэтому это догадка по последней известной
 * цене: у самого стопа или за ним — стоп, у тейка — тейк. Иначе — нейтральное
 * «исполнено»: ошибиться мелодией в сторону «хорошо» или «плохо» хуже, чем не
 * угадать вовсе.
 */
function exitSound(p: TerminalPosition): TerminalSound {
  const price = p.markPrice;
  if (price == null) return 'fill';
  const long = p.direction === 'long';
  if (p.stopLoss != null && (long ? price <= p.stopLoss * (1 + NEAR) : price >= p.stopLoss * (1 - NEAR))) return 'stop';
  if (p.takeProfit != null && (long ? price >= p.takeProfit * (1 - NEAR) : price <= p.takeProfit * (1 + NEAR))) return 'take';
  return 'fill';
}

/**
 * Сигналы перехода от снимка счёта к снимку — каждый не больше раза, по
 * важности. Тот же приём, что у сессии бектеста (`soundsOf`): источник —
 * разница состояний, а не колбэки действий, и одна проверка покрывает клик в
 * панели, исполнение на бирже и ордер, поставленный мимо терминала.
 *
 * Лимит пропадает и при своём исполнении, и когда позиция закрыта целиком,
 * поэтому «снят» и «выставлен» звучат, только если с позициями в этом снимке
 * ничего не случилось. Перенос лимита молчит сам: биржа правит цену ордера, и
 * его id остаётся прежним.
 */
export function exchangeSounds(prev: Snapshot, next: Snapshot): TerminalSound[] {
  const found = new Set<TerminalSound>();
  const before = new Map(prev.positions.map((p) => [positionKey(p), p]));
  const after = new Map(next.positions.map((p) => [positionKey(p), p]));

  for (const [key, p] of after) {
    const was = before.get(key);
    // Открытие, долив и частичное закрытие — исполненный ордер.
    if (!was || was.size !== p.size) found.add('fill');
  }
  for (const [key, p] of before) {
    if (!after.has(key)) found.add(exitSound(p));
  }

  if (found.size === 0) {
    const prevIds = new Set(prev.orders.map((o) => o.id));
    const nextIds = new Set(next.orders.map((o) => o.id));
    if (next.orders.some((o) => !prevIds.has(o.id))) found.add('placed');
    if (prev.orders.some((o) => !nextIds.has(o.id))) found.add('cancel');
  }

  return PRIORITY.filter((s) => found.has(s));
}
