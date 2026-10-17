'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FeedRow } from '@/entities/profile';
import { useLocaleControl } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils/css';
import { dateFormat } from '@/shared/lib/utils/intl';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import { pageOf } from '../lib/fit';
import { int, signed } from '../lib/format';

/**
 * Виды движений, у которых есть подпись (`profile.kinds.*`). Новый вид, ещё не
 * получивший перевода, показывается своим именем, а не ключом сообщения.
 */
const KINDS = new Set([
  'DONATION',
  'TOURNAMENT_FEE',
  'TOURNAMENT_BONUS',
  'TOURNAMENT_REFUND',
  'TOURNAMENT_PRIZE',
  'GAME_BUYIN',
  'GAME_CASHOUT',
  'GAME_REFUND',
  'GAME_PAYOUT',
  'REFERRAL_BONUS',
  'BATTLEPASS_REWARD',
  'DAILY_REWARD',
  'JETPACK_BET',
  'JETPACK_WIN',
  'JETPACK_REFUND',
]);

/**
 * Вкладка «Лента монет» — двадцать последних движений из ответа профиля,
 * листаются на странице: своего запроса у вкладки нет. Монеты — не деньги
 * счёта, поэтому сумма не красится в цвета прибыли: списание просто тише.
 */
export function FeedPane({ feed, rows }: { feed: FeedRow[]; rows: number }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const [page, setPage] = useState(1);
  const sheet = pageOf(feed, page, rows);
  const when = dateFormat(intlLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const columns: LedgerColumn<FeedRow>[] = [
    { key: 'at', header: t('colWhen'), render: (r) => <span className="muted">{when.format(new Date(r.at))}</span> },
    { key: 'kind', header: t('colEvent'), render: (r) => (KINDS.has(r.kind) ? t(`kinds.${r.kind}`) : r.kind) },
    {
      key: 'delta',
      header: t('colAmount'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => <span className={cn(r.delta < 0 && 'muted')}>{signed(r.delta)}</span>,
    },
    {
      key: 'balance',
      header: t('colBalance'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => <span className="muted">{int(r.balanceAfter)}</span>,
    },
  ];

  return (
    <>
      <LedgerTable
        columns={columns}
        rows={sheet.items}
        rowKey={(r) => r.id}
        minWidth={560}
        empty={<EmptyState title={t('feedEmptyTitle')}>{t('feedEmptyBody')}</EmptyState>}
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
