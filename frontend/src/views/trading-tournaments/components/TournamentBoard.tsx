'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTournamentBoard, type BoardTournament } from '@/entities/tournament';
import { formatTradeDate } from '@/shared/lib/utils/format';
import { Button } from '@/shared/ui/Button';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';
import { countdown } from '../lib/countdown';
import { useCountdown } from '../model/useCountdown';
import { TournamentBadge } from './TournamentBadge';

/**
 * Все турниры одной таблицей (решение владельца 2026-09-26; прежде — «Мои» и
 * «Открытые» двумя списками). Строка — панель по образцу владельца: значок,
 * название со взносом, формат, фонд, заполненность мест, время и одна кнопка.
 *
 * Порядок строк задаёт сервер: созданные мной, потом где я играю, потом чужие
 * публичные — см. `boardOrder` на бэкенде. Кнопки создателя («Удалить»,
 * «Завершить») живут в подвале окна турнира: в строке одна кнопка.
 *
 * Подписи стоят внутри ячеек («призовой фонд», «конец через»), как на
 * образце, поэтому шапка таблицы спрятана (`.tboard`); на узком экране строки
 * становятся карточками с подписями колонок (`label`).
 */
export function TournamentBoard({
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
  const { data, isLoading, error } = useTournamentBoard();

  const columns: LedgerColumn<BoardTournament>[] = [
    { key: 'status', label: t('colStatus'), width: 120, render: (x) => <TournamentBadge status={x.status} /> },
    {
      key: 'name',
      label: t('colName'),
      render: (x) => (
        <span className="tb-cell">
          <span className="tb-name">{x.name}</span>
          <span className="tb-sub">
            {x.entryFee > 0 ? (
              <>
                {t('entryShort')} {x.entryFee} <CoinIcon />
              </>
            ) : (
              t('freeEntry')
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'format',
      label: t('colFormat'),
      render: (x) => (
        <span className="tb-meta">
          {[
            ...(x.format === 'teams'
              ? [t('formatTeams', { n: x.teamSize ?? 0 })]
              : [x.maxPlayers === 2 ? t('formatDuel') : t('formatArena'), t('seatsN', { n: x.maxPlayers })]),
            t(`duration.${x.durationMin}`),
          ].join(' · ')}
        </span>
      ),
    },
    {
      key: 'pool',
      label: t('colPrizePool'),
      render: (x) => (
        <span className="tb-cell">
          <span className="tb-big n">
            {x.prizePool} <CoinIcon />
          </span>
          <span className="tb-sub">{t('poolLabel')}</span>
        </span>
      ),
    },
    { key: 'seats', label: t('colPlayers'), render: (x) => <Seats players={x.players} max={x.maxPlayers} /> },
    { key: 'time', label: t('colTime'), render: (x) => <TimeCell tournament={x} /> },
    { key: 'action', align: 'right', noSkeleton: true, render: (x) => <RowAction tournament={x} onOpen={onOpen} /> },
  ];

  return (
    <section>
      <SectionHead title={t('boardTitle')} />
      {/* Без этой строки упавший запрос выглядел как «турниров нет» — пустая
          таблица не отличает ошибку от пустоты. */}
      <ErrorNote error={error} fallback={t('boardLoadFailed')} />
      <div className="tboard">
        <LedgerTable
          columns={columns}
          rows={data ?? []}
          rowKey={(x) => x.id}
          isLoading={isLoading}
          skeletonRows={3}
          onRowClick={(x) => onOpen(x.id)}
          onRowHover={(x) => onPreload(x.id)}
          busyKey={openingId}
          empty={<EmptyState title={t('boardEmptyTitle')}>{t('boardEmptyBody')}</EmptyState>}
        />
      </div>
    </section>
  );
}

/** Заполненность мест полоской делений — по одному на место, как на образце. */
function Seats({ players, max }: { players: number; max: number }) {
  return (
    <span className="tb-cell">
      <span className="seats" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} data-on={i < players} />
        ))}
      </span>
      <span className="tb-sub seats-n n">
        {players} / {max}
      </span>
    </span>
  );
}

/**
 * Время строки: сколько осталось до конца или до старта, а у прошедших — когда
 * всё кончилось. Отсчёт — свой узел на строку: тикает он один, а не таблица.
 */
function TimeCell({ tournament: x }: { tournament: BoardTournament }) {
  const t = useTranslations('tournaments');
  const target = x.status === 'running' ? x.endsAt : x.status === 'lobby' ? x.startsAt : null;
  const left = useCountdown(target);
  const c = left == null ? null : countdown(left);
  const clock = c == null ? null : typeof c === 'string' ? c : `${t('days', { n: c.days })} ${c.clock}`;

  const [label, value] =
    x.status === 'running'
      ? // Время вышло, а статус прежний: итоги подводит движок на своём тике.
        [t('timeEndsIn'), clock ?? t('finishing')]
      : x.status === 'lobby' && x.startsAt
        ? [t('timeStartsIn'), clock ?? t('starting')]
        : x.status === 'lobby'
          ? [t('timeStart'), t('byReady')]
          : [
              t(x.status === 'finished' ? 'timeFinished' : 'timeCancelled'),
              x.finishedAt ? formatTradeDate(x.finishedAt) : '—',
            ];

  return (
    <span className="tb-cell tb-time">
      <span className="tb-label">{label}</span>
      <span className="tb-clock">{value}</span>
    </span>
  );
}

/**
 * Кнопка строки — по тому, что с турниром можно сделать сейчас. Всё, кроме
 * «Торговать», открывает окно турнира: вход с взносом, сделки идущего и итоги
 * завершённого живут там. Своему набору и отменённому кнопка не нужна (решение
 * владельца 2026-09-27): «Открыть» повторяла клик по самой строке.
 */
function RowAction({ tournament: x, onOpen }: { tournament: BoardTournament; onOpen: (id: string) => void }) {
  const t = useTranslations('tournaments');
  const router = useRouter();
  const mine = x.relation !== 'other';

  if (x.status === 'running' && mine) {
    return (
      <Button tight variant="solid" onClick={() => router.push(`/games/trading/${x.id}`)}>
        {t('trade')}
      </Button>
    );
  }

  const label =
    x.status === 'running'
      ? t('actWatch')
      : x.status === 'lobby' && !mine
        ? t('actJoin')
        : x.status === 'finished'
          ? t('actResults')
          : null;
  if (label == null) return null;
  return (
    <Button tight onClick={() => onOpen(x.id)}>
      {label}
    </Button>
  );
}
