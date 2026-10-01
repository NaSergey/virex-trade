'use client';

import { useTranslations } from 'next-intl';
import type { TournamentDetail } from '@/entities/tournament';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';
import { TEAM_NAMES } from '../lib/teams';

type Row = TournamentDetail['winners'][number];

/**
 * Итог турнира — только призёры и свой собственный результат.
 *
 * Таблицы всех участников с их эквити в продукте нет: турнир — соревнование
 * между приглашёнными людьми, и публиковать, кто сколько слил, он не обязан.
 *
 * У командного турнира призёры — вся победившая команда с одним местом на
 * всех, поэтому колонки места нет, а в заголовке — какая команда победила.
 */
export function Winners({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const teams = detail.tournament.format === 'teams';
  const teamOf = new Map(detail.participants.map((p) => [p.userId, p.team]));
  const winnerTeam = detail.winners.length ? teamOf.get(detail.winners[0].userId) : null;

  const columns: LedgerColumn<Row>[] = [
    ...(teams
      ? []
      : [
          {
            key: 'place',
            header: t('colPlace'),
            align: 'right' as const,
            cellClassName: 'n',
            width: 56,
            render: (x: Row) => x.place,
          },
        ]),
    { key: 'name', header: t('colPlayer'), render: (x) => x.name ?? '—' },
    {
      key: 'prize',
      header: t('colPrize'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (
        <>
          {x.prizeWon ?? 0} <CoinIcon />
        </>
      ),
    },
  ];

  return (
    <section className="tsect">
      <SectionHead
        title={teams && winnerTeam != null ? t('teamWonTitle', { team: TEAM_NAMES[winnerTeam] }) : t('winnersTitle')}
      />
      <LedgerTable columns={columns} rows={detail.winners} rowKey={(x) => x.userId} />
      {teams && detail.me?.place != null && (
        <p className="muted">
          {detail.me.place === 1
            ? t('myTeamWon', { prize: detail.me.prizeWon ?? 0, unit: tc('unit') })
            : t('myTeamLost')}
        </p>
      )}
      {!teams && detail.me?.place != null && (
        <p className="muted">
          {t('myResult', {
            place: detail.me.place,
            equity: Math.round(detail.me.finalEquity ?? 0).toLocaleString('ru-RU'),
            prize: detail.me.prizeWon ?? 0,
            unit: tc('unit'),
          })}
        </p>
      )}
    </section>
  );
}
