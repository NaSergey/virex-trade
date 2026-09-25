'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { BjHand, BjOutcome, BjPhase, BjSeat as Seat } from '@/entities/game-table';
import { cn } from '@/shared/lib/utils/css';
import {
  ChipStack,
  DEALER,
  offsetFrom,
  PlayingCard,
  SeatPlate,
  WIN_FLY,
  type SeatPoint,
} from '@/widgets/card-table';
import { cardKey, type CardMove } from '../lib/events';
import { BET_RISE, SCORE_LEAD, STAKE_HOME, STAKE_LOSE, WIN_HOLD } from '../lib/motion';

/**
 * Итог раунда для места — одной плашкой: исход и сколько он принёс. У одной
 * руки исход её собственный (блэкджек, перебор); у нескольких после сплита —
 * по сумме: выиграл, проиграл или остался при своих.
 */
function resultOf(hands: BjHand[]): { kind: BjOutcome; net: number } | null {
  if (!hands.length || hands.some((h) => !h.outcome)) return null;
  const net = hands.reduce((a, h) => a + h.payout - h.bet, 0);
  if (hands.length === 1) return { kind: hands[0].outcome!, net };
  return { kind: net > 0 ? 'win' : net < 0 ? 'lose' : 'push', net };
}

/**
 * Место за столом блэкджека.
 *
 * **В потоке — только плашка** (`SeatPlate`), и она стоит ровно в точке места.
 * Всё остальное — столбиком над ней (`.bj-above`, прижат к плашке снизу), как
 * за настоящим столом: ставка прямо перед игроком, над ставкой карты. Счёт
 * руки — сбоку от её карт: он про руку. Итог раунда — плашкой на месте ставки,
 * когда фишки с неё уехали («Выигрыш +25»): он про ставку. Три похожие плашки
 * над картами — счёт, исход и «+25» — не говорили, что к чему относится.
 * Строка ставки держит высоту и пустой — карты не прыгают, когда фишки легли
 * или ушли; плашка не прыгает, когда пришли карты.
 *
 * Всё движение — от крупье и к нему: карты прилетают от колоды. Расчёт
 * двигает сама ставка, а не стопки, летящие поверх стола: проигранная уезжает
 * к крупье; выигрыш прилетает от крупье и встаёт рядом со ставкой — при 1:1
 * это такие же фишки, — и обе стопки уезжают в плашку, а стек досчитывается,
 * когда они доехали. Движение внутри ставки кончается ровно на своём месте;
 * стопки поверх стола садились в приблизительную точку и выходили криво, а
 * возврат одной суммой «ставка + выигрыш» раскладывался в чужие номиналы.
 * Раунд кончился — руки уезжают к колоде (`leaving`), а не пропадают.
 * Увиденное вживую движется, загруженное — стоит (`settled`).
 */
export function BjSeat({
  seat,
  at,
  me,
  phase,
  roundId,
  moves,
  payAt,
  settled,
  deadline,
  timerMs,
  draft,
  leaving,
}: {
  seat: Seat;
  at: SeatPoint;
  me: boolean;
  phase: BjPhase;
  roundId: string | null;
  moves: Record<string, CardMove>;
  /** Когда крупье закончил и поехали деньги. */
  payAt: number;
  /** Расчёт этого раунда виден вживую. */
  settled: boolean;
  deadline: number | null;
  timerMs: number;
  /**
   * Своя ставка в окне — фишки, уже долетевшие до сукна: они ложатся на стол
   * по одной, раньше, чем ставка ушла на сервер.
   */
  draft?: number;
  /** Руки убранного раунда: едут к колоде с задержкой своей очереди. */
  leaving?: { id: string; seat: Seat; delay: number };
}) {
  const t = useTranslations('blackjack');
  const tc = useTranslations('cardTable');
  const label = seat.name ?? tc('player', { n: seat.seatIndex + 1 });
  const fromDealer = offsetFrom(DEALER, at);
  const done = phase === 'done';

  // Раунд убран, а руки ещё едут к колоде — рисуются руки убранного раунда
  // с теми же ключами, поэтому узлы не пересоздаются, а уезжают.
  const out = seat.hands.length === 0 && leaving ? leaving : null;
  const hands = out ? out.seat.hands : seat.hands;
  const roundKey = out ? out.id : roundId;

  const staked = seat.hands.reduce((a, h) => a + h.bet, 0);
  const back = seat.hands.reduce((a, h) => a + h.payout, 0);
  const won = seat.hands.reduce((a, h) => a + Math.max(0, h.payout - h.bet), 0);
  const net = done ? back - staked : 0;
  // Расчёт ставки, увиденный вживую: всё проиграно — стопка уезжает к крупье;
  // иначе (выигрыш, ничья) — к игроку, в плашку, а выигрыш сначала прилетает
  // и встаёт рядом.
  const settle = done && settled ? (back === 0 ? 'lose' : 'home') : null;
  const homeAt = won > 0 ? payAt + WIN_FLY + WIN_HOLD : payAt;
  const toDealer = offsetFrom(DEALER, { x: at.x, y: at.y - BET_RISE });
  // Стек досчитывается, когда стопки доехали до плашки.
  const paid = settle === 'home' ? homeAt + STAKE_HOME : 0;
  // Итог проявляется, когда ставка со своего места уже уезжает.
  const resultAt = settle === 'lose' ? payAt + STAKE_LOSE * 0.7 : settle === 'home' ? homeAt + STAKE_HOME * 0.6 : 0;
  const dropping = phase === 'betting' && draft !== undefined;
  const betAmount = phase === 'betting' ? (draft ?? seat.bet) : staked;
  // Фишки, лёгшие на сукно, ушли из стека сразу, ещё до подтверждения ставки:
  // иначе они были бы посчитаны дважды — и на столе, и за спиной.
  const stack = dropping ? seat.stack + seat.bet - betAmount : seat.stack;
  const showBet = betAmount > 0 && (!done || settled);

  const status = seat.sitOut && hands.length === 0 ? tc('sitOut') : null;
  // Итог стоит и пока руки уезжают к колоде — и гаснет вместе с ними.
  const result = resultOf(out ? out.seat.hands : done ? seat.hands : []);
  const resultText = result
    ? t(`outcome.${result.kind}`) +
      (result.net > 0 ? ` +${result.net.toLocaleString()}` : result.net < 0 ? ` −${(-result.net).toLocaleString()}` : '')
    : null;

  return (
    <div
      className={cn('ct-seat', me && 'ct-me', seat.isTurn && 'ct-turn', net > 0 && 'ct-win')}
      style={{ left: `${at.x}%`, top: `${at.y}%`, '--win-delay': `${paid}ms` } as CSSProperties}
    >
      <div
        className={cn('bj-above', out && 'bj-leaving')}
        style={
          { '--dx': fromDealer.dx, '--dy': fromDealer.dy, '--collect-delay': `${out?.delay ?? 0}ms` } as CSSProperties
        }
      >
        {status && <span className="ct-status">{status}</span>}
        {hands.length > 0 && (
          <div className="bj-hands">
            {hands.map((h, hi) => {
              const keys = h.cards.map((c, ci) => cardKey(seat.seatIndex, hi, ci, c));
              // Счёт — как только карта подлетела (`SCORE_LEAD`), не дожидаясь
              // её переворота: после добора игрок ждёт именно число.
              const scoreAt = Math.max(0, ...keys.map((k) => (moves[k] ? moves[k].delay + SCORE_LEAD : 0)));
              return (
                <div key={hi} className={cn('bj-hand', !out && seat.activeHand === hi && 'bj-active')}>
                  <div className="bj-cards">
                    {h.cards.map((c, ci) => {
                      const m = out ? undefined : moves[keys[ci]];
                      return (
                        <PlayingCard
                          key={`${roundKey}:${keys[ci]}`}
                          card={c}
                          size={me ? 'md' : 'sm'}
                          motion={m ? { kind: m.kind, ...fromDealer, delay: m.delay } : undefined}
                        />
                      );
                    })}
                  </div>
                  <span
                    key={`${hi}:${h.total}`}
                    className={cn('bj-total n', h.total > 21 && 'bj-bust')}
                    style={{ animationDelay: `${scoreAt}ms` }}
                  >
                    {h.soft ? `${h.total - 10}/${h.total}` : h.total}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="bj-stake-slot">
          {showBet && (
            <span
              key={`${seat.seatIndex}:${betAmount}`}
              // Своя ставка появляется одним жестом во всех фазах: фишки легли —
              // стопка вздрагивает. Смени её анимация на сдаче, браузер проиграл
              // бы появление ещё раз — ставка «ложилась» бы второй раз по
              // нажатию «Поставить».
              className={cn('bj-stake n', me && 'bj-stake-drop', settle && `bj-stake-${settle}`)}
              style={
                {
                  '--dx': toDealer.dx,
                  '--dy': toDealer.dy,
                  '--pay': `${payAt}ms`,
                  '--home': `${homeAt}ms`,
                } as CSSProperties
              }
            >
              {settle === 'home' && won > 0 && (
                <span className="bj-stake-win">
                  <ChipStack amount={won} />
                </span>
              )}
              <ChipStack amount={betAmount} />
              {/* Сумма — подписью сбоку, а не в одной плашке со стопкой: всё,
                  что летит к ставке (свои фишки, выигрыш), садится в центр
                  стопки и ложилось бы на цифры. */}
              <span className="bj-stake-n n">{betAmount.toLocaleString()}</span>
            </span>
          )}
          {result && resultText && (
            <span
              key={`${roundKey}:result`}
              className={cn('bj-result', `bj-r-${result.kind}`)}
              // Итог проявляется, когда фишки ставки уехали с этого места.
              style={{ animationDelay: `${!out ? resultAt : 0}ms` }}
            >
              {resultText}
            </span>
          )}
        </div>
      </div>
      <SeatPlate
        label={label}
        name={seat.name}
        stack={stack}
        stackDelay={paid}
        turn={seat.isTurn && deadline ? { deadline, turnMs: timerMs } : null}
      />
    </div>
  );
}
