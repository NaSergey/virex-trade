import type { BjSeat, BlackjackView } from '@/entities/game-table';
import { DEAL_FLY, DEAL_STEP, FLIP } from '@/widgets/card-table';
import { COLLECT_MS, COLLECT_STEP, DEAL_BASE, DEALER_DRAW } from './motion';

/**
 * Что произошло между двумя снимками стола — глазами крупье, как у покера
 * (`views/poker-table/lib/events.ts`): сервер присылает состояние, а не
 * события, и движение выводится здесь одной чистой функцией — какие карты
 * летят от колоды, когда переворачивается закрытая карта крупье, куда едут
 * фишки расчёта и что об этом сказать.
 */

/**
 * Крупье говорит о столе, а не о каждом ходе: «ещё» и «хватит» видны по
 * картам и счёту у места.
 */
export type BjLineKey =
  | 'placeBets'
  | 'noMoreBets'
  | 'dealerBlackjack'
  | 'dealerBust'
  | 'dealerHas'
  | 'blackjack'
  | 'left';

export interface BjLine {
  id: number;
  key: BjLineKey;
  name?: string | null;
  seat?: number;
  n?: number;
}

export interface CardMove {
  kind: 'fly' | 'flyFlip' | 'flip';
  delay: number;
}

/**
 * Раунд, который крупье убирает со стола: руки мест и его собственные карты
 * едут к колоде, место за местом, и только потом открывается окно ставок.
 * Без этого новое окно просто стирало бы стол.
 */
export interface Leaving {
  id: string;
  seats: { seat: BjSeat; delay: number }[];
  dealer: BlackjackView['dealer'];
  dealerDelay: number;
}

export interface Track {
  view: BlackjackView;
  /** Раунд, чью сдачу видели вживую: колода тасуется, карты летят. */
  dealtRound: string | null;
  /** Раунд, чей расчёт видели вживую: фишки едут, ставки уходят со стола в свой момент. */
  settledRound: string | null;
  /** Карта (`cardKey`/`dealerKey`) → её движение. Копится весь раунд. */
  cards: Record<string, CardMove>;
  /** Когда крупье закончил и деньги поехали. */
  payAt: number;
  /** Прошлый раунд, который убирается со стола. */
  leaving: Leaving | null;
  /**
   * Когда показывать новое содержимое панели под столом: после того как
   * карты сдачи легли, крупье доиграл или стол убран. Снимок, который ничего
   * не запускал, — сразу.
   */
  enter: number;
  lines: BjLine[];
  seq: number;
}

/** Больше трёх фраз в очереди не держим: крупье не должен отставать от стола. */
const MAX_LINES = 3;
/** Полёт с переворотом — `ct-fly-flip` в globals.css. */
const LAND = DEAL_FLY + FLIP;

/**
 * Ключ карты — её место и она сама: карта, сменившаяся на той же позиции
 * (сплит), — это новый узел, а не та же карта с другим рисунком.
 */
export const cardKey = (seat: number, hand: number, i: number, card: string) => `${seat}:${hand}:${i}:${card}`;
export const dealerKey = (i: number, card: string | null) => `d:${i}:${card ?? 'hole'}`;

export function initTrack(view: BlackjackView): Track {
  return {
    view,
    dealtRound: null,
    settledRound: null,
    cards: {},
    payAt: 0,
    leaving: null,
    enter: 0,
    lines: [],
    seq: 0,
  };
}

const inRound = (v: BlackjackView): BjSeat[] => v.seats.filter((s) => s.hands.length > 0);

/** Следующий снимок: какие карты и фишки поехали и что сказал крупье. */
export function advance(track: Track, next: BlackjackView): Track {
  const prev = track.view;
  const out: Track = { ...track, view: next };
  let seq = track.seq;
  const lines: BjLine[] = [];
  const say = (l: Omit<BjLine, 'id'>) => lines.push({ ...l, id: ++seq });

  const nextBySeat = new Map(next.seats.map((s) => [s.seatIndex, s]));
  for (const p of prev.seats) {
    const n = nextBySeat.get(p.seatIndex);
    if (!n || n.userId !== p.userId) say({ key: 'left', name: p.name, seat: p.seatIndex });
  }
  if (next.phase === 'betting' && prev.phase !== 'betting') say({ key: 'placeBets' });

  const newRound = !!next.roundId && next.roundId !== prev.roundId;
  const cleared = !!prev.roundId && !next.roundId;
  const cards: Record<string, CardMove> = next.roundId && !newRound ? { ...track.cards } : {};
  // Когда долетит последняя карта игроков из этого снимка: крупье
  // вскрывается после неё, а не поверх летящей карты.
  let landed = 0;
  let enter = 0;

  if (cleared) {
    // Крупье убирает стол: руки мест по порядку, свои карты — последними.
    const players = inRound(prev);
    out.leaving = {
      id: prev.roundId!,
      seats: players.map((seat, i) => ({ seat, delay: i * COLLECT_STEP })),
      dealer: prev.dealer,
      dealerDelay: players.length * COLLECT_STEP,
    };
    enter = players.length * COLLECT_STEP + COLLECT_MS;
  }

  if (newRound) {
    if (prev.phase === 'betting') say({ key: 'noMoreBets' });
    out.dealtRound = next.roundId;
    out.leaving = null;
    // Сначала крупье тасует (`DEAL_BASE`), потом сдаёт по кругу, как живой:
    // первая карта каждому, крупье, вторая каждому, закрытая крупье. Сдача,
    // начатая в кадр нажатия «Поставить», читалась рывком.
    const players = inRound(next);
    const n = players.length;
    players.forEach((s, i) => {
      s.hands[0].cards.slice(0, 2).forEach((c, r) => {
        cards[cardKey(s.seatIndex, 0, r, c)] = { kind: 'flyFlip', delay: DEAL_BASE + (r * (n + 1) + i) * DEAL_STEP };
      });
    });
    const d = next.dealer?.cards ?? [];
    if (d[0]) cards[dealerKey(0, d[0])] = { kind: 'flyFlip', delay: DEAL_BASE + n * DEAL_STEP };
    const holeDelay = DEAL_BASE + (2 * n + 1) * DEAL_STEP;
    // Раунд, кончившийся на сдаче (блэкджек у крупье), приходит уже с
    // открытой второй картой: она летит рубашкой и переворачивается на месте.
    cards[dealerKey(1, d[1] ?? null)] = { kind: d[1] ? 'flyFlip' : 'fly', delay: holeDelay };
    landed = holeDelay + LAND;
    enter = holeDelay + DEAL_FLY;
  } else if (next.roundId) {
    const prevBySeat = new Map(prev.seats.map((s) => [s.seatIndex, s]));
    for (const s of inRound(next)) {
      // Новые — карты, которых у места не было: при сплите вторая карта пары
      // переезжает во вторую руку и летать не должна.
      const had = new Map<string, number>();
      for (const c of (prevBySeat.get(s.seatIndex)?.hands ?? []).flatMap((h) => h.cards)) {
        had.set(c, (had.get(c) ?? 0) + 1);
      }
      let k = 0;
      s.hands.forEach((h, hi) =>
        h.cards.forEach((c, ci) => {
          const left = had.get(c) ?? 0;
          if (left > 0) {
            had.set(c, left - 1);
            return;
          }
          const delay = k++ * DEAL_STEP;
          cards[cardKey(s.seatIndex, hi, ci, c)] = { kind: 'flyFlip', delay };
          landed = Math.max(landed, delay + LAND);
        }),
      );
    }
  }

  if (next.phase === 'done' && next.roundId && (newRound || prev.phase !== 'done')) {
    const d = next.dealer?.cards ?? [];
    const reveal = landed;
    if (!newRound && d[1]) cards[dealerKey(1, d[1])] = { kind: 'flip', delay: reveal };
    // Добор — по одной карте, каждая после того, как легла предыдущая.
    let end = reveal + FLIP;
    d.slice(2).forEach((c, i) => {
      const delay = reveal + FLIP + i * DEALER_DRAW;
      if (c) cards[dealerKey(i + 2, c)] = { kind: 'flyFlip', delay };
      end = delay + LAND;
    });
    out.settledRound = next.roundId;
    out.payAt = end;
    enter = Math.max(enter, end);

    const total = next.dealer?.total ?? 0;
    const played = inRound(next).some((s) => s.hands.some((h) => h.outcome !== 'bust' && h.outcome !== 'blackjack'));
    if (d.length === 2 && total === 21) say({ key: 'dealerBlackjack' });
    else if (total > 21) say({ key: 'dealerBust' });
    else if (played) say({ key: 'dealerHas', n: total });

    // Деньги расчёта двигает сама ставка у места (`BjSeat`), с `payAt`: там
    // движение кончается ровно на своём месте. Стопки, летевшие поверх стола в
    // приблизительную точку, садились рядом со ставкой криво.
    for (const s of inRound(next)) {
      if (s.hands.some((h) => h.outcome === 'blackjack')) say({ key: 'blackjack', name: s.name, seat: s.seatIndex });
    }
  }

  if (!next.roundId) out.settledRound = null;
  out.enter = enter;
  out.cards = cards;
  out.lines = lines.length ? [...track.lines, ...lines].slice(-MAX_LINES) : track.lines;
  out.seq = seq;
  return out;
}
