'use client';

import { useSetPositionTags } from '@/shared/api/tags/hooks';
import { formatMoney } from '@/shared/lib/utils/format';
import { TagsDialog } from '@/page/stats/TagsDialog';

/**
 * Разметка ОТКРЫТОЙ позиции с «Обзора». Теги висят на паре символ+направление,
 * пока позиция жива; TradeSyncService потом перенесёт их на все закрывающие
 * сделки — поэтому сетап имеет смысл отмечать на входе, а не постфактум.
 *
 * `initialTagIds` приходит из уже загруженной строки позиции: диалог не ждёт
 * собственный запрос, чтобы показать текущий набор.
 */
export function PositionTagsModal({
  symbol,
  direction,
  unrealisedPnl,
  initialTagIds,
  onClose,
}: {
  symbol: string;
  direction: 'long' | 'short';
  unrealisedPnl: number;
  initialTagIds: string[];
  onClose: () => void;
}) {
  const setPositionTags = useSetPositionTags();

  return (
    <TagsDialog
      title="Теги открытой позиции"
      subtitle={`${symbol} · ${direction} · ещё в рынке · ${formatMoney(unrealisedPnl)} USDT`}
      note="Теги останутся на позиции, пока она открыта, и перейдут на все её закрытые сделки — включая частичные тейки."
      initialTagIds={initialTagIds}
      isPending={setPositionTags.isPending}
      error={
        setPositionTags.isError
          ? setPositionTags.error instanceof Error
            ? setPositionTags.error.message
            : 'Не удалось сохранить теги'
          : null
      }
      onSave={(tagIds) => setPositionTags.mutate({ symbol, direction, tagIds }, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
