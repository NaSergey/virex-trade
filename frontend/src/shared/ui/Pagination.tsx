'use client';

import { memo } from 'react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Листалка журнала. Слева — какие записи сейчас на листе («1—8 из 247»), а не
 * номер страницы: в журнале ориентируются по записям. Кнопки не прячутся на
 * краях диапазона, а гаснут — иначе строка меняет ширину и подпись прыгает.
 */
export const Pagination = memo(({ page, pageSize, total, onPrev, onNext }: PaginationProps) => {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--s3)',
        marginTop: 'var(--s3)',
        flexWrap: 'wrap',
      }}
    >
      <span className="lbl">
        {from}—{to} из {total}
      </span>
      <div style={{ display: 'flex', gap: 'var(--s2)' }}>
        <button className="btn" onClick={onPrev} disabled={page <= 1}>
          ← Назад
        </button>
        <button className="btn" onClick={onNext} disabled={page >= lastPage}>
          Вперёд →
        </button>
      </div>
    </div>
  );
});

Pagination.displayName = 'Pagination';
