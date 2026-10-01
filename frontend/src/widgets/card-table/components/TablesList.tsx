'use client';

import { useTranslations } from 'next-intl';
import { useCloseTable, useMyTables, usePublicTables, type GameTableRow, type GameType } from '@/entities/game-table';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Два списка одной формы — лобби любой карточной игры. «Мои» — где я сижу или
 * что создал; «свободные» — публичные чужие столы, где есть место. Закрытых в
 * свободных нет: в них зовут ссылкой. Ставки стола у каждой игры свои
 * (блайнды покера, лимиты блэкджека) — их колонку даёт игра.
 *
 * Закрыть свой стол можно только отсюда, а не с самого стола. Закрывается
 * лишь пустой стол (`GamesService.close`) — у занятого кнопка стоит
 * неактивной с подсказкой, чтобы было видно, чего не хватает.
 */
export function TablesList({
  gameType,
  kind,
  onOpen,
  stakes,
}: {
  gameType: GameType;
  kind: 'mine' | 'public';
  onOpen: (id: string) => void;
  stakes: { header: string; render: (row: GameTableRow) => string };
}) {
  const t = useTranslations('cardTable');
  const { user } = useAuth();
  const mine = useMyTables();
  const pub = usePublicTables(gameType);
  const close = useCloseTable();
  const q = kind === 'mine' ? mine : pub;
  const rows = (q.data ?? []).filter((x) => x.gameType === gameType);

  const closeColumn: LedgerColumn<GameTableRow> = {
    key: 'actions',
    header: t('colAction'),
    noSkeleton: true,
    align: 'right',
    render: (x) => {
      if (x.status !== 'open' || x.creatorId !== user?.id) return null;
      const busy = x.players > 0;
      return (
        <Button
          tight
          variant="risk"
          disabled={busy || (close.isPending && close.variables === x.id)}
          title={busy ? t('closeBusyHint') : undefined}
          onClick={() => close.mutate(x.id)}
        >
          {t('closeTable')}
        </Button>
      );
    },
  };

  const columns: LedgerColumn<GameTableRow>[] = [
    { key: 'name', header: t('colName'), render: (x) => x.name },
    { key: 'stakes', header: stakes.header, align: 'right', cellClassName: 'n', render: stakes.render },
    {
      key: 'buyin',
      header: t('colBuyIn'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (
        <>
          {x.minBuyIn}–{x.maxBuyIn} <CoinIcon />
        </>
      ),
    },
    {
      key: 'players',
      header: t('colPlayers'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => `${x.players}/${x.maxSeats}`,
    },
    kind === 'mine'
      ? {
          key: 'state',
          header: t('colVisibility'),
          align: 'right',
          render: (x) => (x.status === 'closed' ? t('closed') : x.visibility === 'public' ? t('public') : t('private')),
        }
      : { key: 'creator', header: t('colCreator'), align: 'right', render: (x) => x.creatorName ?? '—' },
    ...(kind === 'mine' ? [closeColumn] : []),
  ];

  return (
    <section>
      <SectionHead title={kind === 'mine' ? t('mineTitle') : t('publicTitle')} />
      <LedgerTable
        columns={columns}
        rows={rows}
        rowKey={(x) => x.id}
        isLoading={q.isLoading}
        // Столов в списке обычно один-три: заглушка на пять строк при первом
        // открытии лобби сжималась до настоящих, и страница под ней прыгала.
        skeletonRows={2}
        onRowClick={(x) => onOpen(x.id)}
        empty={
          kind === 'mine' ? (
            <EmptyState title={t('mineEmptyTitle')}>{t('mineEmptyBody')}</EmptyState>
          ) : (
            <EmptyState title={t('publicEmptyTitle')}>{t('publicEmptyBody')}</EmptyState>
          )
        }
      />
      {kind === 'mine' && <ErrorNote error={close.error} fallback={t('closeFailed')} />}
    </section>
  );
}
