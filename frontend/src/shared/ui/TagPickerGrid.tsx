'use client';

import { memo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';

export interface TagPickerItem {
  id: string;
  name: string;
  color: string;
}

interface TagPickerGridProps {
  tags: TagPickerItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyHint?: string;
}

/**
 * Мультивыбор тегов чипами (цветная точка + имя + галка при выборе) — общий
 * вид для CreateComboModal и TradeTagsModal, раньше был скопирован дословно
 * в обоих местах.
 */
export const TagPickerGrid = memo(
  ({ tags, selected, onToggle, emptyHint = 'Тегов пока нет — создайте их выше, в разделе тегов.' }: TagPickerGridProps) => (
    <div className="flex flex-wrap gap-1.5">
      {tags.length === 0 && <p className="text-xs text-muted">{emptyHint}</p>}
      {tags.map((t) => {
        const active = selected.has(t.id);
        return (
          <button
            key={t.id}
            onClick={() => onToggle(t.id)}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all',
              active ? 'text-fg' : 'border-line text-muted hover:text-fg',
            )}
            style={active ? { borderColor: t.color, background: `${t.color}22` } : undefined}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.name}
            {active && <Check className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  ),
);
TagPickerGrid.displayName = 'TagPickerGrid';
