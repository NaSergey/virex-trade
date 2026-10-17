'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ProfileGame, ProfileOverview } from '@/entities/profile';
import { useLocaleControl } from '@/shared/i18n';
import { dateFormat } from '@/shared/lib/utils/intl';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import { pageOf } from '../lib/fit';
import { int } from '../lib/format';
import { HIDDEN_GAMES } from '../lib/games';

/**
 * Вкладка «Игры» — его результаты по играм. Игр станет двадцать и больше,
 * поэтому лист режется под высоту окна, как и остальные вкладки.
 */
export function GamesPane({ profile, rows }: { profile: ProfileOverview; rows: number }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const [page, setPage] = useState(1);
  const games = profile.games.filter((g) => !HIDDEN_GAMES.has(g.id));
  const sheet = pageOf(games, page, rows);
  // День игры — дата UTC (`YYYY-MM-DD`), и печатается по UTC: в поясе браузера
  // полночь UTC уехала бы на соседний день.
  const dayFmt = dateFormat(intlLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  /**
   * Результат — своё число у каждой игры: у торговли победы в турнирах, у
   * джетпака лучший множитель, у карточных столов результата пока нет (своей
   * таблицы итогов у них нет). Прочерк честнее нуля — нуль обещал бы, что
   * число считается.
   */
  const resultOf = (game: ProfileGame): string => {
    if (game.id === 'tournament') {
      return profile.rating ? t('resWins', { wins: profile.rating.wins }) : '—';
    }
    if (game.id === 'jetpack') {
      return profile.records.bestX100 > 0 ? `${(profile.records.bestX100 / 100).toFixed(2)}x` : '—';
    }
    return '—';
  };

  const columns: LedgerColumn<ProfileGame>[] = [
    { key: 'game', header: t('colGame'), render: (g) => t(`game.${g.id}`) },
    { key: 'played', header: t('colPlayed'), align: 'right', cellClassName: 'n', render: (g) => int(g.played) },
    {
      key: 'result',
      header: t('colResult'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <span className={g.played === 0 ? 'muted' : undefined}>{resultOf(g)}</span>,
    },
    {
      key: 'days90',
      header: t('colDays90'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <span className="muted">{int(g.days90)}</span>,
    },
    {
      key: 'last',
      header: t('colLast'),
      align: 'right',
      render: (g) => (
        <span className="muted">{g.lastDay ? dayFmt.format(new Date(`${g.lastDay}T00:00:00Z`)).replace('.', '') : '—'}</span>
      ),
    },
  ];

  return (
    <>
      <LedgerTable
        columns={columns}
        rows={sheet.items}
        rowKey={(g) => g.id}
        minWidth={560}
        empty={<EmptyState title={t('gamesEmptyTitle')}>{t('gamesEmptyBody')}</EmptyState>}
      />
      {sheet.total > rows && (
        <Pagination
          page={sheet.page}
          pageSize={rows}
          total={sheet.total}
          onPrev={() => setPage(sheet.page - 1)}
          onNext={() => setPage(sheet.page + 1)}
        />
      )}
    </>
  );
}
