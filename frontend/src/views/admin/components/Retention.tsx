'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { AdminRetention } from '../api/hooks';

type Row = AdminRetention['cohorts'][number];

/**
 * Возвращаются ли люди. Строка — неделя, в которую человек зарегистрировался;
 * колонки — заходил ли он спустя ноль, одну, две недели.
 *
 * Неделя 0 меньше 100 % — это не ошибка: часть регистраций не доходит даже до
 * первого содержательного захода, и именно это здесь и видно.
 *
 * Пустая клетка означает «эта неделя для когорты ещё не наступила», а не ноль:
 * у когорты, зарегистрированной вчера, третьей недели просто нет.
 */
export function Retention({ data, isLoading }: { data?: AdminRetention; isLoading?: boolean }) {
  const t = useTranslations('admin');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';

  const rows = data?.cohorts ?? [];
  const width = Math.max(0, ...rows.map((r) => r.weeks.length));

  const columns: LedgerColumn<Row>[] = [
    {
      key: 'cohort',
      header: t('colCohort'),
      render: (row) =>
        new Date(row.cohortStart)
          .toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' })
          .replace('.', ''),
    },
    { key: 'size', header: t('colSize'), align: 'right', cellClassName: 'n', render: (r) => r.size },
    ...Array.from({ length: width }, (_, i): LedgerColumn<Row> => ({
      key: `w${i}`,
      header: `W${i}`,
      align: 'right',
      cellClassName: 'n',
      render: (row) => {
        const cell = row.weeks[i];
        if (!cell) return <span className="muted">·</span>;
        return (
          <span className={cell.users === 0 ? 'muted' : undefined}>
            {cell.users}
            <span className="muted"> · {Math.round(cell.pct)} %</span>
          </span>
        );
      },
    })),
  ];

  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.cohortStart}
      minWidth={120 + width * 90}
      isLoading={isLoading}
      skeletonRows={4}
      empty={t('noCohorts')}
    />
  );
}
