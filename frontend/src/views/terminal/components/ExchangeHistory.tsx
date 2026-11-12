'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TagsDialog, useSetTradeTags } from '@/entities/tag';
import { useTrades, type Trade } from '@/entities/trade';
import { useLocaleControl } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/utils/format';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Pagination } from '@/shared/ui/Pagination';
import { SectionHead } from '@/shared/ui/SectionHead';
import { TradesTable } from '@/widgets/trades-table';

/** Столько же записей на лист, сколько в истории сессии и в журнале обзора. */
const PAGE_SIZE = 10;

/**
 * Вкладка «История» биржевого терминала — закрытые сделки журнала.
 *
 * Та же `TradesTable`, что в истории сессии и на обзоре, под тем же заголовком.
 * Отличие одно и по существу: у сессии вся история приходит с ней самой, а у
 * биржи она лежит в журнале (её приносит синк), поэтому листы ходят на сервер,
 * а строка раскрывается настоящими исполнениями биржи, а не планом входа.
 *
 * Сделка появляется здесь не в момент закрытия, а со следующим проходом синка.
 */
export function ExchangeHistory({ onSymbol }: { onSymbol?: (symbol: string) => void }) {
  const t = useTranslations('backtest');
  const to = useTranslations('overview');
  const { locale } = useLocaleControl();
  const [page, setPage] = useState(1);
  const [tagging, setTagging] = useState<Trade | null>(null);
  const { data, isLoading } = useTrades({ page, pageSize: PAGE_SIZE });
  const setTags = useSetTradeTags();

  const closedLabel = (trade: Trade) =>
    new Date(trade.closedAt)
      .toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      .replace('.', '');

  return (
    <section>
      <SectionHead title={t('closedTradesTitle')} />
      <TradesTable
        trades={data?.trades ?? []}
        isLoading={isLoading && !data}
        skeletonRows={PAGE_SIZE}
        onEditTags={setTagging}
        onSymbol={onSymbol}
        empty={<EmptyState title={t('noTrades')} />}
      />
      {data && data.total > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data.total}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
      {tagging && (
        <TagsDialog
          title={t('tradeTagsTitle')}
          subtitle={`${tagging.symbol} · ${t(`direction.${tagging.direction}`)} · ${to('closedAt', { date: closedLabel(tagging) })} · ${formatMoney(tagging.closedPnl)} USDT`}
          initialTagIds={(tagging.tags ?? []).map((g) => g.id)}
          isPending={setTags.isPending}
          error={setTags.error}
          onSave={(tagIds) => setTags.mutate({ tradeId: tagging.id, tagIds }, { onSuccess: () => setTagging(null) })}
          onClose={() => setTagging(null)}
        />
      )}
    </section>
  );
}
