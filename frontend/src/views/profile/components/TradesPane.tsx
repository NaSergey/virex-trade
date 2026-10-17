'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useProfileTrades } from '@/entities/profile';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Pagination } from '@/shared/ui/Pagination';
import { TradesTable } from '@/widgets/trades-table';

/**
 * Вкладка «Сделки на бирже» — его настоящие закрытые сделки. Лист — столько
 * строк, сколько влезает в окно (`rows`), сервер режет его сам (`pageSize`).
 *
 * Чужая сделка не раскрывается и не ведёт в график: ордера позиции и свечи
 * вокруг цены — эндпоинты своих сделок. Тегов в ответе нет.
 */
export function TradesPane({ userId, rows }: { userId: string; rows: number }) {
  const t = useTranslations('profile');
  const [page, setPage] = useState(1);
  const trades = useProfileTrades(userId, page, rows, true);

  return (
    <>
      {trades.error && <ErrorNote error={trades.error} fallback={t('tradesFailed')} />}
      <TradesTable
        trades={trades.data?.trades ?? []}
        isLoading={trades.isLoading}
        skeletonRows={rows}
        chart={false}
        expand={false}
        tags={false}
        empty={<EmptyState title={t('tradesEmptyTitle')}>{t('tradesEmptyBody')}</EmptyState>}
      />
      <Pagination
        page={trades.data?.page ?? page}
        pageSize={trades.data?.pageSize ?? rows}
        total={trades.data?.total ?? 0}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </>
  );
}
