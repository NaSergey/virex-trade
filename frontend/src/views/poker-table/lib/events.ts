import type { HandCategory, PokerView } from '@/entities/game-table';
import { COLLECT, DEAL_FLY, FLIP, WIN_FLY, type Ghost } from '@/widgets/card-table';
import { BOARD_BASE, BOARD_STEP } from './motion';

/**
 * Что произошло между двумя снимками стола — глазами крупье.
 *
 * Сервер присылает состояние, а не события: так проще держать его верным, и
 * переподключившийся клиент не пропускает ходов. Движение же — это разница
 * между соседними снимками, и выводится она здесь, в одном месте, чистой
 * функцией: какие фишки съехали в банк, чьи карты ушли в колоду, что открыто
 * на борде, кому уехал банк и что об этом сказать.
 */

/**
 * Крупье говорит о столе, а не о каждом ходе: чек, колл, рейз и фолд уже
 * подписаны над местом игрока, и повтор тех же слов в центре стола читался
 * потоком уведомлений поверх банка. Остаются улица, олл-ин, вскрытие, кому
 * ушёл банк и кто встал из-за стола.
 */
export type DealerLineKey =
  | 'allIn'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'wins'
  | 'left';

export interface DealerLine {
  id: number;
  key: DealerLineKey;
  name?: string | null;
  seat?: number;
  amount?: number;
  category?: HandCategory | null;
}

export interface Track {
  view: PokerView;
  /** Раздача, чью сдачу видели вживую, — только её карты летят от колоды. */
  dealtHand: string | null;
  /** Карты борда, открытые вживую в этой раздаче, → задержка их полёта. */
  board: Record<string, number>;
  /** Когда фишки банка долетят до победителя: с этой задержкой растёт его стек. */
  winDelay: number;
  /** Когда переворачивать чужие карты на вскрытии. */
  revealDelay: number;
  ghosts: Ghost[];
  lines: DealerLine[];
  seq: number;
}

/** Больше трёх фраз в очереди не держим: крупье не должен отставать от стола. */
const MAX_LINES = 3;

export function initTrack(view: PokerView): Track {
  return { view, dealtHand: null, board: {}, winDelay: 0, revealDelay: 0, ghosts: [], lines: [], seq: 0 };
}

const bySeat = (v: PokerView) => new Map(v.seats.map((s) => [s.seatIndex, s]));

/** Следующий снимок: какие предметы поехали и что сказал крупье. */
export function advance(track: Track, next: PokerView): Track {
  const prev = track.view;
  const out: Track = { ...track, view: next };
  const ph = prev.hand;
  const nh = next.hand;
  let seq = track.seq;
  const ghosts: Ghost[] = [];
  const lines: DealerLine[] = [];
  const say = (l: Omit<DealerLine, 'id'>) => lines.push({ ...l, id: ++seq });
  const ghost = (g: Omit<Ghost, 'id'>) => ghosts.push({ ...g, id: ++seq });

  if (!nh) {
    out.board = {};
    out.dealtHand = null;
  } else if (!ph || ph.id !== nh.id) {
    // Новая раздача: сдача от колоды. Итог прошлой просто уходит со стола.
    out.dealtHand = nh.id;
    out.board = {};
    out.winDelay = 0;
    out.revealDelay = 0;
  } else {
    const prevSeats = bySeat(prev);
    const nextSeats = bySeat(next);

    for (const p of prev.seats) {
      const n = nextSeats.get(p.seatIndex);
      const gone = !n || n.userId !== p.userId;
      // Сброшенные вне очереди (ушёл из-за стола) и по очереди — карты в колоду.
      if (p.inHand && !p.folded && (gone || n!.folded) && p.seatIndex !== next.me.seatIndex) {
        ghost({ what: 'cards', from: { seat: p.seatIndex }, to: 'dealer', delay: 0 });
      }
      if (gone) say({ key: 'left', name: p.name, seat: p.seatIndex });
      else if (n!.allIn && !p.allIn) say({ key: 'allIn', name: n!.name, seat: n!.seatIndex });
    }

    const streetChanged = ph.street !== nh.street;
    if (streetChanged) {
      for (const p of prev.seats) {
        if (p.bet > 0) ghost({ what: 'chips', from: { bet: p.seatIndex }, to: 'center', delay: 0, amount: p.bet });
      }
    }

    // Новые карты борда: одна за другой, после того как ставки съехали в банк.
    const added = nh.board.slice(ph.board.length);
    const board = { ...track.board };
    const base = streetChanged ? BOARD_BASE : 0;
    added.forEach((card, i) => (board[card] = base + i * BOARD_STEP));
    out.board = board;
    if (nh.street === 'flop' || nh.street === 'turn' || nh.street === 'river') {
      if (streetChanged) say({ key: nh.street });
    }

    if (nh.street === 'done' && ph.street !== 'done') {
      const boardEnd = added.length ? base + (added.length - 1) * BOARD_STEP + DEAL_FLY + FLIP : COLLECT;
      // Вскрытие — когда открылись чужие карты; при победе фолдом их нет.
      const showdown = next.seats.some(
        (s) => s.seatIndex !== next.me.seatIndex && s.inHand && !s.folded && (s.cards?.length ?? 0) > 0,
      );
      out.revealDelay = boardEnd;
      out.winDelay = boardEnd + (showdown ? FLIP + 200 : 120);
      if (showdown) say({ key: 'showdown' });
      for (const w of nh.winners) {
        ghost({
          what: 'chips',
          from: 'center',
          to: { seat: w.seatIndex },
          delay: out.winDelay,
          amount: w.amount,
          ms: WIN_FLY,
        });
        const seat = nextSeats.get(w.seatIndex) ?? prevSeats.get(w.seatIndex);
        say({ key: 'wins', name: seat?.name ?? null, seat: w.seatIndex, amount: w.amount, category: w.category });
      }
    }
  }

  out.ghosts = ghosts.length ? [...track.ghosts, ...ghosts] : track.ghosts;
  out.lines = lines.length ? [...track.lines, ...lines].slice(-MAX_LINES) : track.lines;
  out.seq = seq;
  return out;
}

/** Порядок сдачи: с малого блайнда по кругу (в хедз-апе малый блайнд — кнопка). */
export function dealOrder(view: PokerView): Map<number, number> {
  const inHand = view.seats.filter((s) => s.inHand).sort((a, b) => a.seatIndex - b.seatIndex);
  const n = inHand.length;
  const button = Math.max(0, inHand.findIndex((s) => s.isButton));
  const start = n === 2 ? button : (button + 1) % n;
  const order = new Map<number, number>();
  inHand.forEach((s, i) => order.set(s.seatIndex, (i - start + n) % n));
  return order;
}
