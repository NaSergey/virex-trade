'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/shared/ui/Field';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useAdminUsers, type AdminUserRow, type UserSort } from '../api/hooks';
import { calendarDaysAgo } from '../model/lastSeen';
import { UserDetail } from './UserDetail';

const PAGE_SIZE = 25;

/**
 * Кто зарегистрирован и что с ним происходит.
 *
 * Отбор, сортировка и страницы живут здесь, а не на странице: за пределами
 * таблицы они ничего не значат. Считает их сервер — сортировать приехавшую
 * страницу на клиенте значило бы упорядочивать двадцать пять случайных строк
 * вместо всех.
 *
 * Строка раскрывается в карточку пользователя (LedgerTable.renderExpanded):
 * отдельная страница на человека здесь не нужна — смотрят обычно «а этот
 * вообще заходил», не уходя из списка.
 */
export function UsersTable({ days, enabled }: { days: number; enabled: boolean }) {
  const t = useTranslations('admin');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: UserSort; dir: 1 | -1 }>({ key: 'lastSeenAt', dir: -1 });
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useAdminUsers(
    {
      days,
      sort: sort.key,
      order: sort.dir < 0 ? 'desc' : 'asc',
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      q: search.trim() || undefined,
    },
    // Как и остальные запросы раздела — только после того, как сессия
    // восстановлена и право известно. Безусловный запрос уходил ещё до токена,
    // получал 401 и тянул за собой лишний обмен refresh-токена.
    enabled,
  );

  const columns: LedgerColumn<AdminUserRow>[] = [
    {
      key: 'email',
      header: t('colUser'),
      render: (row) => (
        <>
          {row.email}
          {row.name ? <span className="muted"> · {row.name}</span> : null}
        </>
      ),
    },
    {
      key: 'lastSeenAt',
      header: t('colLastSeen'),
      align: 'right',
      sortKey: 'lastSeenAt',
      render: (row) => <LastSeen iso={row.lastSeenAt} />,
    },
    {
      key: 'visits',
      header: t('colVisits'),
      align: 'right',
      cellClassName: 'n',
      sortKey: 'visits',
      render: (row) => row.visits,
    },
    {
      key: 'daysActive',
      header: t('colDays'),
      align: 'right',
      cellClassName: 'n',
      sortKey: 'daysActive',
      render: (row) => row.daysActive,
    },
    {
      key: 'actions',
      header: t('colActions'),
      align: 'right',
      cellClassName: 'n',
      sortKey: 'actions',
      render: (row) => row.actions,
    },
    {
      key: 'trades',
      header: t('colTrades'),
      align: 'right',
      cellClassName: 'n',
      sortKey: 'trades',
      render: (row) => row.trades,
    },
    {
      key: 'tags',
      header: t('colTags'),
      align: 'right',
      cellClassName: 'n',
      sortKey: 'tags',
      render: (row) => row.tags,
    },
    {
      key: 'exchanges',
      header: t('colExchange'),
      render: (row) =>
        row.exchanges.length ? (
          row.exchanges.join(', ')
        ) : (
          // Ключи не подключены — человек до продукта ещё не дошёл, и это
          // важнее любой другой строки о нём.
          <span className="muted">{t('noKeys')}</span>
        ),
    },
    {
      key: 'registeredAt',
      header: t('colRegistered'),
      align: 'right',
      sortKey: 'createdAt',
      render: (row) => <LastSeen iso={row.registeredAt} />,
    },
  ];

  const rows = data?.rows ?? [];

  return (
    <>
      <div className="newrow">
        <Input
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          style={{ width: 220 }}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // Иначе поиск, сузивший список до трёх строк, показал бы пустоту:
            // страница-то осталась четвёртой.
            setPage(1);
          }}
        />
      </div>

      <ErrorNote error={error} fallback={t('loadFailed')} />

      <LedgerTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={980}
        isLoading={isLoading && rows.length === 0}
        skeletonRows={6}
        empty={search ? t('noMatches') : t('noUsers')}
        sort={{ key: sort.key, dir: sort.dir }}
        onSort={(key) =>
          setSort((s) =>
            s.key === key
              ? { key: s.key, dir: (s.dir * -1) as 1 | -1 }
              : { key: key as UserSort, dir: -1 },
          )
        }
        renderExpanded={(row) => <UserDetail userId={row.id} days={days} />}
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </>
  );
}

/**
 * «Сегодня», «вчера», «12 дн.» — вместо даты.
 *
 * Владелец спрашивает у этой колонки не «какого числа он был», а «давно ли»:
 * дата требует посчитать разницу в уме, и на списке из сорока строк это ровно
 * сорок вычитаний.
 */
function LastSeen({ iso }: { iso: string | null }) {
  const t = useTranslations('admin');
  const days = calendarDaysAgo(iso);

  if (days == null) return <span className="muted">{t('never')}</span>;
  if (days === 0) return <>{t('today')}</>;
  if (days === 1) return <>{t('yesterday')}</>;
  return <span className={days > 30 ? 'muted' : undefined}>{t('daysAgo', { n: days })}</span>;
}
