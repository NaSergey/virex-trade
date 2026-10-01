'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useMoveTeam, type TournamentDetail, type TournamentPlayer } from '@/entities/tournament';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { TEAM_NAMES } from '../lib/teams';

/**
 * Состав турнира со сводкой по каждому.
 *
 * Сводка — по закрытым сделкам: это итог, а в итог открытое не входит. Сами
 * сделки, открытые тоже, стоят блоком «Сделки» ниже. Поэтому «Результат»
 * здесь — не эквити и не место: человек, сидящий в плюсовой позиции, в этой
 * таблице его не показывает, и колонку нельзя читать турнирной таблицей.
 *
 * В лобби сессий ещё нет, считать нечего — там остаётся список имён с одной
 * отметкой: кто уже готов начать. Она и есть весь смысл лобби — турнир
 * стартует сам, когда отмечены все, и человек должен видеть, кого ждут.
 * У лобби по времени отметки нет: оно стартует само в назначенную минуту, и
 * «ждёт» напротив имени обещало бы ожидание, которого не будет. Отменённый
 * турнир так и не начался — у него тоже только имена.
 *
 * Командный турнир — две колонки, A и B (решение владельца 2026-09-27). В
 * наборе создатель переставляет игроков кнопкой у имени; у идущего над каждой
 * командой — её средний результат по закрытым сделкам: победу решает среднее.
 */
export function Participants({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  const { status, startsAt, format } = detail.tournament;
  const namesOnly = status === 'lobby' || status === 'cancelled';
  const showReady = status === 'lobby' && startsAt == null;

  if (format === 'teams') {
    return (
      <section className="tsect">
        <SectionHead title={t('participantsTitle')} />
        <div className="teams-grid">
          {[0, 1].map((team) => (
            <TeamColumn key={team} detail={detail} team={team} namesOnly={namesOnly} showReady={showReady} />
          ))}
        </div>
      </section>
    );
  }

  if (namesOnly) {
    return (
      <section className="tsect">
        <SectionHead title={t('participantsTitle')} />
        <PlayersList players={detail.participants} showReady={showReady} />
      </section>
    );
  }

  return (
    <section className="tsect">
      <SectionHead title={t('participantsTitle')} />
      <StatsTable players={detail.participants} />
    </section>
  );
}

/** Одна команда: заголовок с составом (или средним), дальше имена или сводка. */
function TeamColumn({
  detail,
  team,
  namesOnly,
  showReady,
}: {
  detail: TournamentDetail;
  team: number;
  namesOnly: boolean;
  showReady: boolean;
}) {
  const t = useTranslations('tournaments');
  const players = detail.participants.filter((p) => p.team === team);
  const size = detail.tournament.teamSize ?? 0;
  // Среднее по игрокам команды — тем же правилом, что решает победу; у кого
  // сделок ещё нет, тот идёт в среднее нулём, как и в финале его эквити равно
  // депозиту.
  const average = players.length ? players.reduce((s, p) => s + (p.stats?.pnl ?? 0), 0) / players.length : 0;
  const canMove = namesOnly && detail.tournament.status === 'lobby' && detail.isCreator;

  return (
    <div className="team-col">
      <div className="team-head">
        <span className="team-name">{t('teamName', { team: TEAM_NAMES[team] })}</span>
        <span className="n muted">
          {namesOnly ? `${players.length} / ${size}` : <Money value={average} />}
        </span>
      </div>
      {namesOnly ? (
        <PlayersList
          players={players}
          showReady={showReady}
          action={
            canMove
              ? (p) => (
                  <MoveButton
                    tournamentId={detail.tournament.id}
                    player={p}
                    to={1 - team}
                    full={detail.participants.filter((x) => x.team === 1 - team).length >= size}
                  />
                )
              : undefined
          }
        />
      ) : (
        <StatsTable players={players} narrow />
      )}
    </div>
  );
}

function PlayersList({
  players,
  showReady,
  action,
}: {
  players: TournamentPlayer[];
  showReady: boolean;
  action?: (p: TournamentPlayer) => ReactNode;
}) {
  const t = useTranslations('tournaments');
  return (
    <ul className="players">
      {players.map((p) => (
        <li key={p.userId}>
          {p.name ?? '—'}
          <span className="players-r">
            {showReady && (
              <span className="pstate" data-r={p.ready}>
                {p.ready ? t('ready') : t('notReady')}
              </span>
            )}
            {action?.(p)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Перенос игрока в другую команду — только у создателя и только в наборе. */
function MoveButton({
  tournamentId,
  player,
  to,
  full,
}: {
  tournamentId: string;
  player: TournamentPlayer;
  to: number;
  full: boolean;
}) {
  const t = useTranslations('tournaments');
  const move = useMoveTeam(tournamentId);
  return (
    <>
      <Button
        tight
        variant="bare"
        disabled={full || move.isPending}
        title={full ? t('teamFullHint') : undefined}
        onClick={() => move.mutate({ userId: player.userId, team: to })}
      >
        {t('moveTo', { team: TEAM_NAMES[to] })}
      </Button>
      <ErrorNote as="span" error={move.error} fallback={t('actionFailed')} />
    </>
  );
}

/** `narrow` — колонка команды: половина окна, и ширина журнала по умолчанию в неё не входит. */
function StatsTable({ players, narrow = false }: { players: TournamentPlayer[]; narrow?: boolean }) {
  const t = useTranslations('tournaments');
  const columns: LedgerColumn<TournamentPlayer>[] = [
    { key: 'name', header: t('colPlayer'), render: (p) => p.name ?? '—' },
    {
      key: 'trades',
      header: t('colClosedTrades'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => p.stats?.trades ?? 0,
    },
    {
      key: 'winRate',
      header: t('colWinRate'),
      align: 'right',
      cellClassName: 'n',
      // Без сделок винрейт не «ноль процентов», а неизвестен: ноль читался бы
      // как «всё слил», хотя человек просто ещё не закрыл ни одной.
      render: (p) => (p.stats && p.stats.trades > 0 ? `${Math.round(p.stats.winRate)}%` : '—'),
    },
    {
      key: 'pnl',
      header: t('colClosedPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => (p.stats && p.stats.trades > 0 ? <Money value={p.stats.pnl} /> : '—'),
    },
  ];
  return (
    <LedgerTable columns={columns} rows={players} rowKey={(p) => p.userId} minWidth={narrow ? 300 : undefined} />
  );
}
