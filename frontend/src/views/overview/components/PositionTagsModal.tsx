'use client';

import { useTranslations } from 'next-intl';
import { useSetPositionTags } from '@/entities/tag';
import { formatMoney } from '@/shared/lib/utils/format';
import { TagsDialog } from './TagsDialog';

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
  const t = useTranslations('overview');
  const setPositionTags = useSetPositionTags();

  return (
    <TagsDialog
      title={t('positionTagsTitle')}
      subtitle={`${symbol} · ${direction} · ${t('stillOpen')} · ${formatMoney(unrealisedPnl)} USDT`}
      note={t('positionTagsNote')}
      initialTagIds={initialTagIds}
      isPending={setPositionTags.isPending}
      error={setPositionTags.error}
      onSave={(tagIds) => setPositionTags.mutate({ symbol, direction, tagIds }, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
