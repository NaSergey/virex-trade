'use client';

import { useTranslations } from 'next-intl';
import type { TournamentDetail } from '@/entities/tournament';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';

type Row = TournamentDetail['winners'][number];

/**
 * Итог турнира — только призёры и свой собственный результат.
 *
 * Таблицы всех участников с их эквити в продукте нет: турнир — соревнование
 * между приглашёнными людьми, и публиковать, кто сколько слил, он не обязан.
 */
export function Winners({ detail }: { detail: TournamentDetail }) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');

  const columns: LedgerColumn<Row>[] = [
    { key: 'place', header: t('colPlace'), align: 'right', cellClassName: 'n', width: 56, render: (x) => x.place },
    { key: 'name', header: t('colPlayer'), render: (x) => x.name ?? '—' },
    {
      key: 'prize',
      header: t('colPrize'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => `${x.prizeWon ?? 0} ${tc('unit')}`,
    },
  ];

  return (
    <section className="tsect">
      <SectionHead title={t('winnersTitle')} />
      <LedgerTable columns={columns} rows={detail.winners} rowKey={(x) => x.userId} />
      {detail.me?.place != null && (
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
