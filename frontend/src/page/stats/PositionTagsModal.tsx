'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { ModalFooterActions } from '@/shared/ui/ModalFooterActions';
import { TagPickerGrid, type TagPickerItem } from '@/shared/ui/TagPickerGrid';
import { useTags, useSetPositionTags } from '@/shared/api/tags/hooks';
import { formatPnl, pnlColor } from '@/shared/lib/utils/format';

/**
 * Разметка ОТКРЫТОЙ позиции тегами прямо с «Обзора».
 *
 * Отличие от TradeTagsModal: там теги вешаются на конкретную закрытую сделку,
 * здесь — на пару символ+направление, пока позиция жива. TradeSyncService потом
 * сам перенесёт их на все закрывающие сделки этой позиции, поэтому размечать
 * сетап имеет смысл прямо на входе, а не постфактум.
 *
 * `initialTagIds` приходит из уже загруженной строки позиции — модалка не ждёт
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
  const { data: tagsData } = useTags();
  const setPositionTags = useSetPositionTags();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTagIds));

  const allTags: TagPickerItem[] = tagsData?.tags ?? [];

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    setPositionTags.mutate({ symbol, direction, tagIds: [...selected] }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Теги позиции</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-xs">
          <span className="font-medium text-fg">{symbol}</span>
          <span className={`font-medium ${direction === 'long' ? 'text-up' : 'text-down'}`}>
            {direction === 'long' ? 'LONG' : 'SHORT'}
          </span>
          <span className="text-subtle">открыта</span>
          <span className={`ml-auto font-mono font-semibold ${pnlColor(unrealisedPnl)}`}>
            {formatPnl(unrealisedPnl)} USDT
          </span>
        </div>

        <p className="text-[11px] text-muted">
          Теги останутся на позиции, пока она открыта, и перейдут на все её закрытые сделки — включая
          частичные тейки.
        </p>

        <TagPickerGrid tags={allTags} selected={selected} onToggle={toggle} />

        {setPositionTags.isError && (
          <p className="text-xs text-down">
            {setPositionTags.error instanceof Error
              ? setPositionTags.error.message
              : 'Не удалось сохранить теги'}
          </p>
        )}

        <ModalFooterActions
          onCancel={onClose}
          onConfirm={save}
          confirmLabel={setPositionTags.isPending ? 'Сохранение…' : 'Сохранить'}
          confirmDisabled={setPositionTags.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
