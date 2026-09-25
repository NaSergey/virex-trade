'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { pokerViewKey, usePokerAction, usePokerFlags, usePokerView, type PokerView } from '@/entities/game-table';
import { cn } from '@/shared/lib/utils/css';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import {
  AnimatedNumber,
  BuyInDialog,
  CardSlot,
  CardTable,
  ChipStack,
  COLLECT,
  DEALER,
  DealerSay,
  Effects,
  EmptySeat,
  offsetFrom,
  PlayingCard,
  TableFrame,
  TableMenu,
  TableShell,
  Toggle,
  useLeaveOnExit,
  useSeatPoints,
  useTableSocket,
} from '@/widgets/card-table';
import { ActionBar } from './components/ActionBar';
import { HandRankings } from './components/HandRankings';
import { Seat } from './components/Seat';
import { advance, dealOrder, initTrack } from './lib/events';
import { boardPoint } from './lib/motion';
import { usePokerSay } from './model/usePokerSay';

/**
 * Покерный стол — /games/poker/<id>. Стол общий с блэкджеком
 * (`widgets/card-table`): овал, места по кругу (своё — внизу), крупье во
 * главе. Своё у покера — банк и борд в центре сукна, две карты на месте,
 * панель хода с рейзом и два переключателя; слева — справка по комбинациям,
 * если её включили в меню «⋯».
 *
 * Страница ничего не опрашивает: первый снимок приходит REST'ом, дальше его
 * подменяет сокет. Действия — REST: они двигают фишки.
 *
 * Движение — разница между соседними снимками (`advance`): сервер присылает
 * состояние, а стол показывает, как оно получилось, — от лица крупье.
 */
export function PokerTablePage({ id }: { id: string }) {
  const { data: view, error, isLoading } = usePokerView(id);
  useTableSocket(id, 'poker_state', pokerViewKey);

  return (
    <TableFrame loading={isLoading} error={error}>
      {view ? <Table view={view} /> : null}
    </TableFrame>
  );
}

const RANKS_KEY = 'virex.poker.ranks';
const decodeRanks = (raw: string | null) => raw === '1';
const encodeRanks = (on: boolean) => (on ? '1' : null);

function Table({ view }: { view: PokerView }) {
  const t = useTranslations('poker');
  const tc = useTranslations('cardTable');
  const id = view.table.id;
  const action = usePokerAction(id);
  const flags = usePokerFlags(id);
  const say = usePokerSay();
  const [buyIn, setBuyIn] = useState(false);
  const [ranks, setRanks] = usePersistentValue(RANKS_KEY, decodeRanks, false, encodeRanks);
  // Прошлый снимок и то, что из разницы с ним ещё едет по столу. Пересчёт —
  // прямо в рендере при новом снимке: так движение стартует тем же кадром,
  // что и новое состояние, а не кадром позже.
  const [track, setTrack] = useState(() => initTrack(view));
  if (track.view !== view) setTrack(advance(track, view));
  const ghostDone = useCallback((gid: number) => setTrack((t) => ({ ...t, ghosts: t.ghosts.filter((g) => g.id !== gid) })), []);
  const lineDone = useCallback((lid: number) => setTrack((t) => ({ ...t, lines: t.lines.filter((l) => l.id !== lid) })), []);

  const mySeat = view.me.seatIndex;
  const seated = mySeat !== null;
  const hand = view.hand;
  const bySeat = new Map(view.seats.map((s) => [s.seatIndex, s]));
  const winners = new Map((hand?.winners ?? []).map((w) => [w.seatIndex, w]));
  const board = hand?.board ?? [];
  const pot = hand ? hand.pot : 0;
  const pointOf = useSeatPoints(view.table.maxSeats, mySeat);
  const order = dealOrder(view);
  const dealt = !!hand && track.dealtHand === hand.id;
  const potStyle = hand?.street === 'done' ? ({ animationDelay: `${track.winDelay}ms` } as CSSProperties) : undefined;
  const turnKey = `${hand?.street}:${hand?.currentBet}:${view.seats.find((s) => s.isTurn)?.seatIndex}:${view.me.legal?.minRaiseTo}`;

  // Ушёл со страницы — встал из-за стола. Отдельной кнопки «Встать» нет:
  // «Столы» и любой другой переход по сайту поднимают из-за стола сами.
  useLeaveOnExit(id, seated, pokerViewKey);

  const center = (
    <>
      <DealerSay lines={track.lines} onShift={lineDone} render={say} />
      {/* На сукне, а не под столом: там строка добавляла высоты низу, и стол
          менял размер в момент старта раздачи. */}
      {!hand && seated && view.seats.length < 2 && <span className="ct-center-note">{t('waitingPlayers')}</span>}
      {pot > 0 && (
        <span key={hand?.id} className={cn('pk-pot', hand?.street === 'done' && 'pk-pot-out')} style={potStyle}>
          <ChipStack amount={pot} width={20} />
          {t('pot')} <AnimatedNumber className="n pk-pot-n" value={pot} delay={COLLECT} />
        </span>
      )}
      <div className="pk-board">
        {Array.from({ length: 5 }, (_, i) => {
          const card = board[i];
          if (!card) return <CardSlot key={i} />;
          const delay = track.board[card];
          return (
            <PlayingCard
              key={card}
              card={card}
              size="lg"
              motion={delay === undefined ? undefined : { kind: 'flyFlip', ...offsetFrom(DEALER, boardPoint(i)), delay }}
            />
          );
        })}
      </div>
    </>
  );

  return (
    <>
      <TableShell
        backHref="/games/poker"
        menu={<TableMenu toggles={[{ label: t('ranksToggle'), on: ranks, onToggle: () => setRanks(!ranks) }]} />}
        side={ranks ? <HandRankings /> : null}
        stage={
          <CardTable
            maxSeats={view.table.maxSeats}
            pointOf={pointOf}
            shuffleKey={dealt ? hand!.id : null}
            center={center}
            renderSeat={(i, at) => {
              const seat = bySeat.get(i);
              if (!seat) {
                return <EmptySeat at={at} canSit={!seated && view.table.status === 'open'} onSit={() => setBuyIn(true)} />;
              }
              return (
                <Seat
                  seat={seat}
                  at={at}
                  me={i === mySeat}
                  street={hand?.street ?? null}
                  deadline={hand?.deadline ?? null}
                  turnMs={hand?.turnMs ?? 20000}
                  win={winners.get(i) ?? null}
                  motion={{
                    handId: hand?.id ?? null,
                    dealt,
                    order: order.get(i) ?? 0,
                    players: order.size,
                    revealDelay: track.revealDelay,
                    winDelay: track.winDelay,
                  }}
                />
              );
            }}
            overlay={<Effects ghosts={track.ghosts} pointOf={pointOf} onDone={ghostDone} />}
          />
        }
        bottom={
          seated ? (
            <>
              <div className="ct-controls">
                <div className="ct-toggles">
                  <Toggle on={view.me.foldAny} label={t('foldAny')} onClick={() => flags.mutate({ foldAny: !view.me.foldAny })} />
                  <Toggle on={view.me.sitOut} label={t('sitOutNext')} onClick={() => flags.mutate({ sitOut: !view.me.sitOut })} />
                </div>
                <ActionBar key={turnKey} view={view} pending={action.isPending} onAct={(a) => action.mutate(a)} />
              </div>
              <ErrorNote error={action.error} fallback={t('actionFailed')} />
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
