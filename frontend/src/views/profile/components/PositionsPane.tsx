'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useProfilePositions } from '@/entities/profile';
import { useLocaleControl } from '@/shared/i18n';
import { durationUnitLabels, formatPositionAge } from '@/shared/lib/utils/format';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Pagination } from '@/shared/ui/Pagination';
import { PositionsTable } from '@/widgets/positions-table';
import { pageOf } from '../lib/fit';

/**
 * Вкладка «Открытые позиции» — та же таблица, что «сейчас» на обзоре, без
 * диапазона входа и тегов и без шапки: время снимка и сумма P&L над таблицей
 * сняты владельцем 2026-10-17, название и так стоит на вкладке. Это снимок
 * синка (раз в минуту), а не биржа: чужой профиль не ходит к бирже ключом
 * владельца.
 */
export function PositionsPane({ userId, rows }: { userId: string; rows: number }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useProfilePositions(userId, true);

  if (error) return <ErrorNote error={error} fallback={t('positionsFailed')} />;
  if (isLoading || !data) {
    // Заглушки строк той же таблицы — на месте, где встанут позиции.
    return (
      <PositionsTable
        positions={[]}
        totalPnl={null}
        renderAge={() => null}
        flush
        isLoading
        skeletonRows={Math.min(rows, 3)}
      />
    );
  }
  if (data.positions.length === 0) {
    return <EmptyState title={t('posEmptyTitle')}>{t('posEmptyBody')}</EmptyState>;
  }

  const sheet = pageOf(data.positions, page, rows);
  const openedAt = new Map(data.positions.map((p) => [`${p.symbol}-${p.direction}`, p.openedAt]));
  const units = durationUnitLabels(locale);

  return (
    <>
      <PositionsTable
        positions={sheet.items}
        totalPnl={null}
        renderAge={(p) => (
          <span className="muted">{formatPositionAge(openedAt.get(`${p.symbol}-${p.direction}`), units)}</span>
        )}
        flush
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
