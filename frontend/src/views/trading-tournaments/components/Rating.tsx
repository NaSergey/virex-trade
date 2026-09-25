'use client';

import { useTranslations } from 'next-intl';
import { useTournamentRating, type RatingRow } from '@/entities/tournament';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Сколько строк рейтинга показывать в боковой колонке. Сервер отдаёт до
 * пятидесяти, но здесь лидерборд стоит рядом со списками турниров, а не вместо
 * них: полсотни строк в узкой колонке — простыня, которую никто не дочитает.
 * Кто за пределами первой десятки, узнаёт себя из строки под таблицей.
 */
const TOP = 10;

/**
 * Лидерборд игры — про всех, кто доиграл хотя бы один турнир, а не про один
 * турнир. Очки за турнир: участников минус место, поэтому победа над девятью
 * весит больше победы над одним.
 *
 * Колонки «турниров» здесь нет намеренно: в боковой колонке помещаются четыре,
 * и число попыток — справка, а очки с победами — сам результат.
 */
export function Rating({ viewerId }: { viewerId: string | undefined }) {
  const t = useTranslations('tournaments');
  const { data, isLoading } = useTournamentRating();
  const all = data?.rows ?? [];
  const rows = all.slice(0, TOP);

  const columns: LedgerColumn<RatingRow>[] = [
    { key: 'place', header: t('colPlace'), align: 'right', cellClassName: 'n', width: 48, render: (x) => x.place },
    {
      key: 'name',
      header: t('colPlayer'),
      render: (x) => (x.userId === viewerId ? <strong>{x.name}</strong> : x.name),
    },
    { key: 'points', header: t('colPoints'), align: 'right', cellClassName: 'n', render: (x) => x.points },
    { key: 'wins', header: t('colWins'), align: 'right', cellClassName: 'n', render: (x) => x.wins },
  ];

  return (
    <section>
      <SectionHead title={t('ratingTitle')}>
        {all.length > TOP && <span className="subtle rating-note">{t('ratingTop', { n: TOP })}</span>}
      </SectionHead>
      <p className="subtle rating-note">{t('ratingLead')}</p>
      <LedgerTable
        columns={columns}
        rows={rows}
        rowKey={(x) => x.userId}
        // Таблица стоит в узкой боковой колонке (.marg), а не на всю ширину
        // листа: дефолтные 760px журнала здесь шире самой колонки и уводили
        // таблицу в горизонтальную прокрутку — пустое состояние, отцентрованное
        // по этой ширине, оказывалось за правым краем видимого куска.
        minWidth={300}
        isLoading={isLoading}
        skeletonRows={5}
        empty={<EmptyState title={t('ratingEmptyTitle')}>{t('ratingEmptyBody')}</EmptyState>}
      />
      {/* Своя строка ниже таблицы: человек за пятидесятым местом иначе не
          увидел бы себя вовсе и не понял, что рейтинг вообще про него. */}
      {data?.me && (
        <p className="muted">
          {t('ratingMe', { place: data.me.place, points: data.me.points, wins: data.me.wins })}
        </p>
      )}
    </section>
  );
}
