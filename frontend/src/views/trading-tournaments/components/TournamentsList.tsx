'use client';

import { useTranslations } from 'next-intl';
import { useFinishTournament, useMyTournaments, useRemoveTournament, type MyTournament } from '@/entities/tournament';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Действие строки: лобби и завершённый свой турнир — «Удалить», идущий —
 * «Завершить». Оба необратимы и оба доступны только создателю (финал — ещё и
 * владельцу сервиса), поэтому в строке живёт ровно одна кнопка. Идущий
 * удалить нельзя — у него есть незакрытые сессии остальных участников
 * (`TournamentsService.remove`), для него и есть «Завершить».
 *
 * Отдельным компонентом, а не инлайновым рендером колонки: мутации нужны на
 * каждую строку свои, а хук нельзя звать внутри `.map` самого списка.
 */
function TournamentRowAction({
  tournament: x,
  isCreator,
  canFinish,
}: {
  tournament: MyTournament;
  isCreator: boolean;
  canFinish: boolean;
}) {
  const t = useTranslations('tournaments');
  const finish = useFinishTournament(x.id);
  const remove = useRemoveTournament(x.id);

  if (x.status !== 'running' && isCreator) {
    return (
      <Button tight variant="risk" disabled={remove.isPending} onClick={() => remove.mutate()}>
        {t('remove')}
      </Button>
    );
  }
  if (x.status === 'running' && canFinish) {
    return (
      <Button
        tight
        variant="risk"
        disabled={finish.isPending}
        title={t('finishNowHint')}
        onClick={() => finish.mutate()}
      >
        {t('finishNow')}
      </Button>
    );
  }
  return null;
}

/** Турниры, где я участник. Чужие сюда не попадают — только по ссылке или из открытых. */
export function TournamentsList({
  onOpen,
  onPreload,
  openingId,
}: {
  onOpen: (id: string) => void;
  /** Данные турнира заказываются по наведению — окно открывается уже с ними. */
  onPreload: (id: string) => void;
  /** Турнир, чьи данные едут прямо сейчас: его строка держится занятой. */
  openingId: string | null;
}) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const { data, isLoading } = useMyTournaments();
  const { user } = useAuth();

  const columns: LedgerColumn<MyTournament>[] = [
    { key: 'name', header: t('colName'), render: (x) => x.name },
    { key: 'status', header: t('colStatus'), render: (x) => t(`status.${x.status}`) },
    {
      key: 'players',
      header: t('colPlayers'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => `${x.players}/${x.maxPlayers}`,
    },
    {
      key: 'fee',
      header: t('colEntryFee'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.entryFee > 0 ? `${x.entryFee} ${tc('unit')}` : t('free')),
    },
    {
      key: 'ends',
      header: t('colEnds'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.endsAt ? new Date(x.endsAt).toLocaleString() : '—'),
    },
    {
      // Безымянная, как каретка: несёт действие, а не значение.
      key: 'actions',
      noSkeleton: true,
      render: (x) => {
        const isCreator = x.creatorId === user?.id;
        // Решает всё равно бэкенд (создатель, у финала — ещё и владелец
        // сервиса) — здесь только чтобы не показывать кнопку, заведомо
        // отвечающую 403.
        return (
          <TournamentRowAction
            tournament={x}
            isCreator={isCreator}
            canFinish={isCreator || !!user?.isAdmin}
          />
        );
      },
    },
  ];

  return (
    <section>
      <SectionHead title={t('myTitle')} />
      <LedgerTable
        columns={columns}
        rows={data ?? []}
        rowKey={(x) => x.id}
        isLoading={isLoading}
        onRowClick={(x) => onOpen(x.id)}
        onRowHover={(x) => onPreload(x.id)}
        busyKey={openingId}
        empty={<EmptyState title={t('myEmptyTitle')}>{t('myEmptyBody')}</EmptyState>}
      />
    </section>
  );
}
