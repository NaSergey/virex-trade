'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  blackjackViewKey,
  useBlackjackAction,
  useBlackjackBet,
  useBlackjackFlags,
  useBlackjackView,
  type BjLegal,
  type BlackjackView,
} from '@/entities/game-table';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import {
  BuyInDialog,
  CardTable,
  DealerSay,
  Effects,
  EmptySeat,
  stagePointOf,
  TableFrame,
  TableMenu,
  TableShell,
  Toggle,
  useLeaveOnExit,
  useSeatPoints,
  useTableSocket,
  type Ghost,
} from '@/widgets/card-table';
import { ActionBar } from './components/ActionBar';
import { BetPanel } from './components/BetPanel';
import { BjSeat } from './components/BjSeat';
import { DealerHand } from './components/DealerHand';
import { advance, initTrack, type BjLine } from './lib/events';
import { BET_RISE, CHIP_FLY } from './lib/motion';

/** Фишка, летящая от кнопки на сукно; `total` — черновик ставки, когда она ляжет. */
type Flight = Ghost & { total: number };

/** Что стоит в панели под столом. */
type PanelKind = 'bet' | 'act' | 'status';
interface PanelShown {
  id: string;
  kind: PanelKind;
  status: string;
  /** Проявиться после того, как на столе доиграло то, чего панель ждёт. */
  delay: number;
}
/** Уходящая панель — то, что нужно, чтобы нарисовать её ещё на время угасания. */
interface PanelGone {
  id: string;
  kind: PanelKind;
  status: string;
  draft: number;
  placed: number | null;
}

const NO_MOVES: BjLegal = { hit: false, stand: false, double: false, split: false };
const noop = () => undefined;

/**
 * Стол блэкджека — /games/blackjack/<id>. Тот же стол, что у покера
 * (`widgets/card-table`): овал, места по кругу (своё — внизу), крупье с
 * колодой во главе. Своё у блэкджека — рука крупье и строка правил в центре
 * сукна, руки веером на местах, панель ставок в окно и панель хода.
 *
 * Играют против крупье-казино: выигрыш платит заведение. Страница ничего не
 * опрашивает — первый снимок приходит REST'ом, дальше его подменяет сокет;
 * ставки и ходы — REST, они двигают фишки. Движение — разница соседних
 * снимков (`advance`), от лица крупье.
 */
export function BlackjackTablePage({ id }: { id: string }) {
  const { data: view, error, isLoading } = useBlackjackView(id);
  useTableSocket(id, 'blackjack_state', blackjackViewKey);

  return (
    <TableFrame loading={isLoading} error={error} className="bj-page">
      {view ? <Table view={view} /> : null}
    </TableFrame>
  );
}

function Table({ view }: { view: BlackjackView }) {
  const t = useTranslations('blackjack');
  const tc = useTranslations('cardTable');
  const id = view.table.id;
  const bet = useBlackjackBet(id);
  const action = useBlackjackAction(id);
  const flags = useBlackjackFlags(id);
  const [buyIn, setBuyIn] = useState(false);
  // Черновик ставки: сумма в панели и фишки, уже долетевшие до сукна. Живёт
  // здесь, а не в панели, — ту же ставку показывает место на столе. Каждое
  // окно ставок начинается с нуля.
  const [draft, setDraft] = useState(0);
  const [landed, setLanded] = useState(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [betting, setBetting] = useState(view.phase === 'betting');
  if ((view.phase === 'betting') !== betting) {
    setBetting(view.phase === 'betting');
    setDraft(0);
    setLanded(0);
    setFlights([]);
  }
  // Прошлый снимок и то, что из разницы с ним ещё едет по столу. Пересчёт —
  // прямо в рендере: движение стартует тем же кадром, что и новое состояние,
  // а панель под столом в этом же проходе берёт свежую задержку (`enter`).
  const [stored, setTrack] = useState(() => initTrack(view));
  const track = stored.view === view ? stored : advance(stored, view);
  if (track !== stored) setTrack(track);
  const lineDone = useCallback((lid: number) => setTrack((t) => ({ ...t, lines: t.lines.filter((l) => l.id !== lid) })), []);

  const mySeat = view.me.seatIndex;
  const seated = mySeat !== null;
  const pointOf = useSeatPoints(view.table.maxSeats, mySeat);
  const bySeat = new Map(view.seats.map((s) => [s.seatIndex, s]));
  const me = seated ? bySeat.get(mySeat) : undefined;
  const dealt = !!view.roundId && track.dealtRound === view.roundId;
  // Один за столом: ждать некого — у него нет срока на ход и незачем
  // «пропускать раунд» (сервер снимает таймеры сам).
  const solo = view.seats.length <= 1;
  const cap = Math.min(view.table.maxBet, (me?.stack ?? 0) + (me?.bet ?? 0));
  // Ставка лежит перед игроком, над плашкой, — туда и летят фишки.
  const betOf = (i: number) => {
    const p = pointOf(i);
    return { x: p.x, y: p.y - BET_RISE };
  };

  // Фишка летит от кнопки на сукно; сумма на столе растёт, когда она легла.
  const addChip = (amount: number, el: Element) => {
    const next = Math.min(cap, draft + amount);
    if (next <= draft || mySeat === null) return;
    setDraft(next);
    const from = stagePointOf(el);
    if (!from) {
      setLanded(next);
      return;
    }
    setFlights((fs) => [
      ...fs,
      {
        id: Math.min(0, ...fs.map((f) => f.id)) - 1,
        what: 'chips',
        from: { at: from },
        to: { bet: mySeat },
        delay: 0,
        amount: next - draft,
        ms: CHIP_FLY,
        total: next,
      },
    ]);
  };
  const clearDraft = () => {
    setDraft(0);
    setLanded(0);
    setFlights([]);
  };
  const flightDone = (fid: number) => {
    const f = flights.find((x) => x.id === fid);
    if (f) setLanded((l) => Math.max(l, f.total));
    setFlights((fs) => fs.filter((x) => x.id !== fid));
  };
  const settled = !!view.roundId && track.settledRound === view.roundId;
  const nameOf = (name: string | null | undefined, seat: number | undefined) =>
    name ?? (seat != null ? tc('player', { n: seat + 1 }) : '');

  // Ушёл со страницы — встал из-за стола; посреди раунда оставшиеся руки
  // стоят, а выигрыш придёт монетами.
  useLeaveOnExit(id, seated, blackjackViewKey);

  const say = (l: BjLine) => {
    switch (l.key) {
      case 'dealerHas':
        return t('dealer.dealerHas', { n: l.n ?? 0 });
      case 'blackjack':
      case 'left':
        return t(`dealer.${l.key}`, { name: nameOf(l.name, l.seat) });
      default:
        return t(`dealer.${l.key}`);
    }
  };

  const turnOf = view.seats.find((s) => s.isTurn);
  const status = view.me.sitOut && !solo
    ? t('status.sittingOut')
    : me && me.stack < view.table.minBet && me.hands.length === 0
      ? t('status.broke')
      : view.phase === 'playing' && turnOf
        ? t('status.turnOf', { name: nameOf(turnOf.name, turnOf.seatIndex) })
        : view.phase === 'done'
          ? '' // итог виден на столе — подпись «раунд окончен» его только повторяла
          : t('status.waiting');

  // Панель под столом перетекает: прежнее содержимое гаснет, новое
  // проявляется, когда стол доиграл своё — легли карты сдачи, крупье закончил,
  // стол убран. Подмена в кадр снимка и давала ощущение рывка.
  const kind: PanelKind = view.phase === 'betting' && view.me.canBet ? 'bet' : view.me.legal ? 'act' : 'status';
  const panelId = kind === 'status' ? `status:${status}` : kind;
  const [shown, setShown] = useState<PanelShown>({ id: panelId, kind, status, delay: 0 });
  const [gone, setGone] = useState<PanelGone | null>(null);
  if (shown.id !== panelId) {
    setGone({ id: shown.id, kind: shown.kind, status: shown.status, draft, placed: stored.view.me.bet });
    setShown({ id: panelId, kind, status, delay: track.enter });
  }

  const goneNode = !gone ? null : gone.kind === 'bet' ? (
    <BetPanel
      min={view.table.minBet}
      cap={cap}
      draft={gone.draft}
      placed={gone.placed}
      deadline={null}
      timerMs={view.timerMs}
      pending
      onChip={noop}
      onClear={noop}
      onBet={noop}
    />
  ) : gone.kind === 'act' ? (
    <ActionBar legal={NO_MOVES} pending onAct={noop} />
  ) : gone.status ? (
    <p className="ct-wait">{gone.status}</p>
  ) : null;

  const panel =
    view.phase === 'betting' && view.me.canBet ? (
      <BetPanel
        min={view.table.minBet}
        cap={cap}
        draft={draft}
        placed={view.me.bet}
        deadline={view.deadline}
        timerMs={view.timerMs}
        pending={bet.isPending}
        onChip={addChip}
        onClear={clearDraft}
        onBet={(n) => bet.mutate(n)}
      />
    ) : view.me.legal ? (
      <ActionBar legal={view.me.legal} pending={action.isPending} onAct={(a) => action.mutate(a)} />
    ) : status ? (
      <p className="ct-wait">{status}</p>
    ) : null;

  return (
    <>
      <TableShell
        backHref="/games/blackjack"
        menu={<TableMenu />}
        stage={
          <CardTable
            maxSeats={view.table.maxSeats}
            pointOf={pointOf}
            shuffleKey={dealt ? view.roundId : null}
            center={
              <>
                <DealerSay lines={track.lines} onShift={lineDone} render={say} />
                <DealerHand dealer={view.dealer} roundId={view.roundId} moves={track.cards} leaving={track.leaving} />
                <p className="bj-rules">{t('rules')}</p>
              </>
            }
            renderSeat={(i, at) => {
              const seat = bySeat.get(i);
              if (!seat) {
                return <EmptySeat at={at} canSit={!seated && view.table.status === 'open'} onSit={() => setBuyIn(true)} />;
              }
              const out = track.leaving?.seats.find((x) => x.seat.seatIndex === i && x.seat.userId === seat.userId);
              return (
                <BjSeat
                  seat={seat}
                  at={at}
                  me={i === mySeat}
                  phase={view.phase}
                  roundId={view.roundId}
                  moves={track.cards}
                  payAt={track.payAt}
                  settled={settled}
                  deadline={view.deadline}
                  timerMs={view.timerMs}
                  draft={i === mySeat && view.phase === 'betting' ? landed || (view.me.bet ?? 0) : undefined}
                  leaving={out && track.leaving ? { id: track.leaving.id, seat: out.seat, delay: out.delay } : undefined}
                />
              );
            }}
            overlay={
              <Effects ghosts={flights} pointOf={pointOf} betOf={betOf} onDone={flightDone} />
            }
          />
        }
        bottom={
          seated ? (
            <>
              <div className="ct-controls">
                {!solo && (
                  <div className="ct-toggles">
                    <Toggle
                      on={view.me.sitOut}
                      label={t('sitOutToggle')}
                      onClick={() => flags.mutate({ sitOut: !view.me.sitOut })}
                    />
                  </div>
                )}
                <div className="bj-panel">
                  {gone && (
                    <div
                      key={`gone:${gone.id}`}
                      className="bj-panel-out"
                      aria-hidden
                      onAnimationEnd={(e) => e.target === e.currentTarget && setGone(null)}
                    >
                      {goneNode}
                    </div>
                  )}
                  <div key={panelId} className="bj-panel-in" style={{ animationDelay: `${shown.delay}ms` }}>
                    {panel}
                  </div>
                </div>
              </div>
              <ErrorNote error={action.error ?? bet.error} fallback={t('actionFailed')} />
            </>
          ) : (
            <p className="ct-wait">{view.table.status === 'open' ? tc('spectatorHint') : tc('tableClosed')}</p>
          )
        }
      />

      {buyIn && (
        <BuyInDialog tableId={id} min={view.table.minBuyIn} max={view.table.maxBuyIn} onClose={() => setBuyIn(false)} />
      )}
    </>
  );
}
