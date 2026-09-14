'use client';

import { useTranslations } from 'next-intl';
import { useTags } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { useSetBacktestTags } from '../api/hooks';
import type { SessionDetail } from '../api/types';
import { SessionTrades } from './SessionTrades';
import { SummaryCells } from './SummaryCells';

/**
 * После завершения скрытое раскрывается: настоящие даты отрезка и настоящие
 * цены сделок. У тренажёра дат нет — вместо них строка о том, что рынок
 * сгенерирован. Теги ставить можно и здесь — разметка не обязана успеть к концу
 * сессии.
 */
export function SessionSummary({ detail, onLeave }: { detail: SessionDetail; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';
  const { session, trades, summary } = detail;
  const { data: tagsData } = useTags();
  const setTags = useSetBacktestTags(session.id);

  const full = (ms: number) =>
    new Date(ms).toLocaleString(intl, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const short = (ms: number) =>
    new Date(ms).toLocaleString(intl, { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <SectionHead title={t('summaryTitle')}>
        <Button tight onClick={onLeave}>
          {t('backToList')}
        </Button>
      </SectionHead>
      <p>
        {session.dataSource === 'synthetic'
          ? t('syntheticRevealed')
          : t('revealed', { from: full(Date.parse(session.startTime)), to: full(Date.parse(session.cursorTime)) })}
      </p>
      <p className="muted">
        {t('balanceFromTo', { from: formatPriceGrouped(session.startBalance), to: formatPriceGrouped(session.balance) })}
      </p>
      <SummaryCells summary={summary} maxDrawdownPct={summary.maxDrawdownPct} />
      <SessionTrades
        trades={trades}
        scale={1}
        labelFor={short}
        tags={tagsData?.tags ?? []}
        onSetTags={(tradeId, tagIds) => setTags.mutate({ tradeId, tagIds })}
      />
    </>
  );
}
