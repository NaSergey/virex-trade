'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { ModalFooterActions } from '@/shared/ui/ModalFooterActions';
import { TagPickerGrid, type TagPickerItem } from '@/shared/ui/TagPickerGrid';
import { useTags, useSetTradeTags } from '@/shared/api/tags/hooks';
import type { Trade } from '@/shared/api/bybit/hooks';
import { formatPnl, pnlColor } from '@/shared/lib/utils/format';

/**
 * Разметка закрытой сделки тегами прямо из таблицы истории.
 *
 * Отличается от разметки открытой позиции (useSetPositionTags): там теги
 * висят на паре символ+направление, пока позиция жива, здесь — на конкретной
 * закрытой сделке. Набор заменяется целиком, поэтому стартуем от того, что
 * уже стоит на сделке.
 */
export function TradeTagsModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const { data: tagsData } = useTags();
  const setTradeTags = useSetTradeTags();
  const [selected, setSelected] = useState<Set<string>>(new Set((trade.tags ?? []).map((t) => t.id)));

  const allTags: TagPickerItem[] = tagsData?.tags ?? [];

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    setTradeTags.mutate(
      { tradeId: trade.id, tagIds: [...selected] },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Теги сделки</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-xs">
          <span className="font-medium text-fg">{trade.symbol}</span>
          <span className={`font-medium ${trade.direction === 'long' ? 'text-up' : 'text-down'}`}>
            {trade.direction === 'long' ? 'LONG' : 'SHORT'}
          </span>
          <span className={`ml-auto font-mono font-semibold ${pnlColor(trade.closedPnl)}`}>
            {formatPnl(trade.closedPnl)} USDT
          </span>
        </div>

        <TagPickerGrid tags={allTags} selected={selected} onToggle={toggle} />

        {setTradeTags.isError && (
          <p className="text-xs text-down">
            {setTradeTags.error instanceof Error ? setTradeTags.error.message : 'Не удалось сохранить теги'}
          </p>
        )}

        <ModalFooterActions
          onCancel={onClose}
          onConfirm={save}
          confirmLabel={setTradeTags.isPending ? 'Сохранение…' : 'Сохранить'}
          confirmDisabled={setTradeTags.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
