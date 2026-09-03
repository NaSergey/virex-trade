'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import type { AdminOverview } from '../api/hooks';

type Row = AdminOverview['sections'][number];

/**
 * Чем в сервисе пользуются, а что написано и стоит мёртвым.
 *
 * Разбивка идёт по продуктовым разделам, а не по адресам API: «Выборка» и
 * «Привычки» живут в одном контроллере со сделками, но это разные функции, и
 * мерить их вместе с журналом бессмысленно.
 *
 * Колонка «людей» здесь важнее обращений: сто обращений одного человека и по
 * пять обращений двадцати — это разные новости об одном и том же разделе.
 */
export function Sections({ rows, isLoading }: { rows: Row[]; isLoading?: boolean }) {
  const t = useTranslations('admin');

  const columns: LedgerColumn<Row>[] = [
    {
      key: 'section',
      header: t('colSection'),
      render: (row) => sectionLabel(t, row.section),
    },
    { key: 'users', header: t('colPeople'), align: 'right', cellClassName: 'n', render: (r) => r.users },
    {
      key: 'requests',
      header: t('colRequests'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => r.requests,
    },
    {
      key: 'actions',
      header: t('colActions'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => r.actions,
    },
  ];

  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.section}
      minWidth={420}
      isLoading={isLoading}
      skeletonRows={5}
      empty={t('noSections')}
    />
  );
}

/**
 * Подпись раздела. Неизвестный ключ показывается как есть, а не как «прочее»:
 * на бэкенде завели новый раздел — это должно быть видно, а не спрятано в общей
 * куче.
 */
export function sectionLabel(t: (key: string) => string, section: string): string {
  const known = [
    'journal',
    'stats',
    'lab',
    'habits',
    'sync',
    'tags',
    'market',
    'settings',
    'telegram',
    'support',
    'terminal',
    'auth',
    'other',
  ];
  return known.includes(section) ? t(`sections.${section}`) : section;
}
