'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useProfileTrades, type ProfileGame, type ProfileOverview } from '@/entities/profile';
import { useLocaleControl } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Pagination } from '@/shared/ui/Pagination';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg } from '@/shared/ui/Seg';
import { TradesTable } from '@/widgets/trades-table';
import { int } from '../lib/format';

/**
 * Что человек делал — вкладками: «Игры» (его результаты) и «Биржа» (настоящие
 * сделки). Решение владельца 2026-10-02: пользователи видят сделки друг друга.
 *
 * Бектеста здесь нет намеренно («бектесты не надо»): своя тренировка — не
 * результат, и смотреть на чужую незачем. Турнирные сделки тоже не дублируются:
 * они открыты в окне своего турнира.
 */
const HIDDEN_GAMES = new Set(['backtest']);

/** Лист чужого журнала — тот же, что режет сервер (`TRADES_PAGE_SIZE`). */
const PAGE_SIZE = 20;

type Tab = 'games' | 'exchange';

export function PlayerResults({ profile }: { profile: ProfileOverview }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';

  // Вкладка «Биржа» есть, только если сделки есть (владелец: «если они есть»).
  // У закрывшего показ признака тоже нет: выключатель не сообщает, сколько
  // сделок спрятано.
  const hasExchange = profile.hasExchangeTrades;
  const [tab, setTab] = useState<Tab>('games');
  const [page, setPage] = useState(1);
  const shown: Tab = hasExchange ? tab : 'games';

  const trades = useProfileTrades(profile.user.id, page, shown === 'exchange');

  const games = profile.games.filter((g) => !HIDDEN_GAMES.has(g.id));

  /**
   * Результат игры — своё число у каждой: у турниров это победы, у джетпака
   * лучший множитель, у карточных столов результата пока нет (XP за них не
   * начисляется, и своей таблицы итогов у них тоже нет). Прочерк честнее
   * нуля — нуль обещал бы, что число считается.
   */
  const resultOf = (game: ProfileGame): string => {
    if (game.id === 'tournament') {
      return profile.rating ? t('resWins', { wins: profile.rating.wins }) : '—';
    }
    if (game.id === 'jetpack') {
      return profile.records.bestX100 > 0 ? `${(profile.records.bestX100 / 100).toFixed(2)}x` : '—';
    }
    return '—';
  };

  const columns: LedgerColumn<ProfileGame>[] = [
    { key: 'game', header: t('colGame'), render: (g) => t(`game.${g.id}`) },
    {
      key: 'played',
      header: t('colPlayed'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => int(g.played),
    },
    {
      key: 'result',
      header: t('colResult'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <span className={g.played === 0 ? 'muted' : undefined}>{resultOf(g)}</span>,
    },
    {
      key: 'days90',
      header: t('colDays90'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <span className="muted">{int(g.days90)}</span>,
    },
    {
      key: 'last',
      header: t('colLast'),
      align: 'right',
      render: (g) => (
        <span className="muted">
          {g.lastDay ? new Date(g.lastDay).toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' }) : '—'}
        </span>
      ),
    },
  ];

  return (
    <section className="pf-results">
      <SectionHead title={shown === 'exchange' ? t('tabExchange') : t('tabGames')}>
        {hasExchange && (
          <Seg
            options={[
              { value: 'games' as Tab, label: t('tabGames') },
              { value: 'exchange' as Tab, label: t('tabExchange') },
            ]}
            value={shown}
            onChange={setTab}
            ariaLabel={t('tabsLabel')}
          />
        )}
      </SectionHead>

      {shown === 'games' ? (
        <LedgerTable
          columns={columns}
          rows={games}
          rowKey={(g) => g.id}
          empty={<EmptyState title={t('gamesEmptyTitle')}>{t('gamesEmptyBody')}</EmptyState>}
        />
      ) : (
        <>
          {trades.error && <ErrorNote error={trades.error} fallback={t('tradesFailed')} />}
          {/* Чужая сделка не раскрывается и не ведёт в график: ордера позиции и
              свечи вокруг цены — эндпоинты своих сделок. Тегов в ответе нет. */}
          <TradesTable
            trades={trades.data?.trades ?? []}
            isLoading={trades.isLoading}
            skeletonRows={PAGE_SIZE}
            chart={false}
            expand={false}
            tags={false}
            empty={<EmptyState title={t('tradesEmptyTitle')}>{t('tradesEmptyBody')}</EmptyState>}
          />
          <Pagination
            page={trades.data?.page ?? page}
            pageSize={trades.data?.pageSize ?? PAGE_SIZE}
            total={trades.data?.total ?? 0}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      )}
    </section>
  );
}
