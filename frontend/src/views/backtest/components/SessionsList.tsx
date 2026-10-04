'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import type { SessionListItem } from '@/widgets/backtest-session';
import { formatR } from '@/widgets/backtest-session/lib/money';

/** Подписи — те же, что у выбора «График» в форме новой сессии. */
const MARKET_LABEL = {
  live: 'marketLive',
  real: 'marketReal',
  synthetic: 'marketSynthetic',
} as const satisfies Record<SessionListItem['dataSource'], string>;

/**
 * Сессии, свежие сверху. Дата в первой колонке — когда сессия создана, а не
 * какой отрезок в ней: отрезок раскрывается только в итоге завершённой.
 *
 * Удаление — не альтернатива завершению: сессия, которую не собираются
 * доигрывать (или доигранная, но неинтересная), пропадает целиком, а не
 * становится записью в статистике. Кнопки-«крестика» на активной сессии в
 * терминале намеренно нет — так сессию можно бросить недосмотренной ошибкой
 * клика; отдельный шаг в списке сессий с подтверждением этого не допускает.
 *
 * Переключателя «реальные / тренажёр» здесь нет: он повторял выбор «График» в
 * форме новой сессии и читался как второй такой же. Статистика ниже считается по
 * реальным сессиям и эфиру, тренажёр в неё не входит (тренды заложены в генератор).
 */
export function SessionsList({
  sessions,
  isLoading,
  onOpen,
  onDelete,
}: {
  sessions: SessionListItem[];
  isLoading: boolean;
  onOpen: (id: string) => void;
  onDelete: (session: SessionListItem) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';

  const columns: LedgerColumn<SessionListItem>[] = [
    {
      key: 'started',
      header: t('colStarted'),
      render: (s) => new Date(s.createdAt).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    { key: 'market', header: t('market'), render: (s) => t(MARKET_LABEL[s.dataSource]) },
    { key: 'status', header: t('colStatus'), render: (s) => t(`status.${s.status}`) },
    { key: 'trades', header: t('colTrades'), align: 'right', cellClassName: 'n', render: (s) => s.summary.trades },
    {
      key: 'win',
      header: t('colWinRate'),
      align: 'right',
      cellClassName: 'n',
      render: (s) => (s.summary.trades ? `${s.summary.winRate.toFixed(0)} %` : '—'),
    },
    {
      key: 'r',
      header: t('colTotalR'),
      align: 'right',
      cellClassName: 'n',
      render: (s) => <span className={s.summary.totalR >= 0 ? 'pos' : 'neg'}>{formatR(s.summary.totalR)}</span>,
    },
    { key: 'pnl', header: t('colPnl'), align: 'right', cellClassName: 'n', render: (s) => <Money value={s.summary.pnl} /> },
    {
      key: 'blind',
      header: t('colBlind'),
      // Дата вслепую — только у истории: тренажёр скрывает её всегда (эпоха вымышленная),
      // а у эфира её не скрыть — будущего нет. Это видно по колонке «График».
      render: (s) =>
        [s.dataSource === 'real' && s.hideDate && t('blindDate'), s.hidePrice && t('blindPrice')]
          .filter(Boolean)
          .join(', ') || <span className="muted">—</span>,
    },
    {
      key: 'action',
      noSkeleton: true,
      render: (s) => (
        <span className="row-actions">
          <Button tight onClick={() => onOpen(s.id)}>
            {s.status === 'active' ? t('continue') : t('open')}
          </Button>
          <Button tight variant="risk" onClick={() => onDelete(s)}>
            {t('deleteSession')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <section data-tour="bt-sessions">
      <SectionHead title={t('sessionsTitle')} />
      <LedgerTable
        columns={columns}
        rows={sessions}
        rowKey={(s) => s.id}
        isLoading={isLoading}
        empty={<EmptyState title={t('noSessions')}>{t('noSessionsHint')}</EmptyState>}
      />
    </section>
  );
}
