'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import { dateFormat } from '@/shared/lib/utils/intl';
import { useHideWallet, useHlWallets, useSaveWallet, type HlWalletRow } from './api/hooks';
import { applyFilters, EMPTY_FILTERS, type WalletFilters as Filters } from './model/filter';
import { sortRows } from './model/sort';
import { walletColumns } from './components/walletColumns';
import { WalletFilters } from './components/WalletFilters';

const PAGE = 50;

/**
 * Кошельки Hyperliquid, которые бот счёл стабильными и живыми. Брать ли
 * кошелёк в работу, решает владелец кнопкой «Сохранить»; боты и
 * маркет-мейкеры здесь законно — по стилю бот не фильтрует (решение владельца
 * 2026-10-19).
 *
 * Право проверяет бэкенд (AdminGuard); флаг isAdmin — только чтобы не стрелять
 * запросами, которые заведомо вернут 403.
 */
export function HlWalletsPage() {
  const t = useTranslations('hlWallets');
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, error } = useHlWallets(!!user?.isAdmin);
  const { save } = useSaveWallet();
  const hide = useHideWallet();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: keyof HlWalletRow; dir: 1 | -1 }>({ key: 'pnlMonth', dir: -1 });
  const [page, setPage] = useState(1);

  // Занята только строка, чей запрос в пути, — не вся колонка.
  const busy = (address: string) => save.isPending && save.variables?.address === address;

  // Кнопки — справа, после чисел: слева стоит адрес, и глаз идёт по нему к цифрам.
  // Сохранённый кошелёк из таблицы уходит (сервер его не отдаёт) — на «Сохранённые».
  const saveCol: LedgerColumn<HlWalletRow> = {
    key: 'save',
    noSkeleton: true,
    width: 110,
    render: (r) => (
      <Button variant="bare" tight onClick={() => save.mutate({ address: r.address })} disabled={busy(r.address)}>
        {t('save')}
      </Button>
    ),
  };

  // Удалить — насовсем: бот этот кошелёк не вернёт. Подтверждения нет: убирают десятки подряд.
  const hideCol: LedgerColumn<HlWalletRow> = {
    key: 'hide',
    noSkeleton: true,
    width: 90,
    render: (r) => (
      <Button
        variant="bare"
        tight
        title={t('hideTitle')}
        onClick={() => hide.mutate(r.address)}
        disabled={hide.isPending && hide.variables === r.address}
      >
        {t('hide')}
      </Button>
    ),
  };

  const all = data?.rows ?? [];
  const filtered = applyFilters(all, filters);
  const rows = sortRows(filtered, sort.key, sort.dir);
  const status = data?.status;
  const at = status?.discoveredAt
    ? dateFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.discoveredAt))
    : '—';

  return (
    <Wrap page>
      <PageHead
        title={t('title')}
        lede={
          status
            ? t('status', {
                qualified: status.qualified,
                analyzed: status.analyzed,
                candidates: status.candidates,
                at,
              })
            : t('lede')
        }
      />
      <WalletFilters
        value={filters}
        onChange={(next) => {
          setPage(1);
          setFilters(next);
        }}
        shown={filtered.length}
        total={all.length}
      />
      <ErrorNote error={error ?? save.error ?? hide.error} fallback={t('loadFailed')} />
      <LedgerTable
        columns={walletColumns(t, [], [saveCol, hideCol])}
        rowClassName={(r) => (r.viewedAt ? 'seen' : undefined)}
        rows={rows.slice((page - 1) * PAGE, page * PAGE)}
        rowKey={(r) => r.address}
        minWidth={1280}
        // Пока восстанавливается сессия, запрос ещё выключен и isLoading ложен —
        // без authLoading таблица на перезагрузке мигала бы «бот ничего не нашёл».
        isLoading={authLoading || isLoading}
        skeletonRows={10}
        empty={all.length ? t('emptyFiltered') : t('empty')}
        sort={{ key: String(sort.key), dir: sort.dir }}
        onSort={(key) => {
          setPage(1);
          setSort((s) =>
            s.key === key
              ? { key: s.key, dir: (s.dir * -1) as 1 | -1 }
              : { key: key as keyof HlWalletRow, dir: -1 },
          );
        }}
      />
      <Pagination
        page={page}
        pageSize={PAGE}
        total={rows.length}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
      {/* Правила отбора — под таблицей, а не в документации: «стабильно в плюсе»
          без чисел читается как обещание, а это фильтр с конкретными порогами. */}
      <p className="muted" style={{ marginTop: 'var(--s5)' }}>
        {t('rules')}
      </p>
    </Wrap>
  );
}
