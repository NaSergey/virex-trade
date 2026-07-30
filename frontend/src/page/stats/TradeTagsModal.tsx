'use client';

import { useSetTradeTags } from '@/shared/api/tags/hooks';
import type { Trade } from '@/shared/api/bybit/hooks';
import { formatMoney } from '@/shared/lib/utils/format';
import { TagsDialog } from '@/page/stats/TagsDialog';

/**
 * Разметка закрытой сделки прямо из журнала. Набор заменяется целиком, поэтому
 * стартуем от того, что уже стоит на сделке.
 */
export function TradeTagsModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const setTradeTags = useSetTradeTags();

  const closed = new Date(trade.closedAt)
    .toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');

  return (
    <TagsDialog
      title="Теги сделки"
      subtitle={`${trade.symbol} · ${trade.direction} · закрыта ${closed} · ${formatMoney(trade.closedPnl)} USDT`}
      initialTagIds={(trade.tags ?? []).map((t) => t.id)}
      isPending={setTradeTags.isPending}
      error={
        setTradeTags.isError
          ? setTradeTags.error instanceof Error
            ? setTradeTags.error.message
            : 'Не удалось сохранить теги'
          : null
      }
      onSave={(tagIds) => setTradeTags.mutate({ tradeId: trade.id, tagIds }, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
