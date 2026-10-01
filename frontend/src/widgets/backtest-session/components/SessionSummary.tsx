'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TagsDialog } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { isLiveSession, useDecimalsOf, useSetBacktestTags } from '../api/hooks';
import type { SessionDetail } from '../api/types';
import { toScreen } from '../lib/money';
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
  const setTags = useSetBacktestTags(session.id);
  const [taggingFor, setTaggingFor] = useState<string | null>(null);
  const decimalsOf = useDecimalsOf(isLiveSession(detail));

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
        onEditTags={(trade) => setTaggingFor(trade.id)}
        decimalsOf={decimalsOf}
      />
      {taggingFor != null && (() => {
        const trade = trades.find((x) => x.id === taggingFor);
        return trade ? (
          <TagsDialog
            title={t('tradeTagsTitle')}
            subtitle={`${trade.symbol} · ${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, 1), decimalsOf(trade.symbol))}`}
            initialTagIds={trade.tags.map((g) => g.id)}
            isPending={setTags.isPending}
            error={setTags.error}
            onSave={(tagIds) => setTags.mutate({ tradeId: trade.id, tagIds }, { onSuccess: () => setTaggingFor(null) })}
            onClose={() => setTaggingFor(null)}
          />
        ) : null;
      })()}
    </>
  );
}
