'use client';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { TagPicker } from '@/shared/ui/TagPicker';
import { useTags } from '@/shared/api/tags/hooks';

/**
 * Разметка тегами — один диалог на закрытую сделку и на открытую позицию.
 *
 * Разница между ними только в том, к чему крепится набор (сделка / пара
 * символ+направление) и что об этом сказано в подзаголовке; всё остальное —
 * тот же выбор из тех же тегов, поэтому это один компонент, а не два похожих.
 */
export function TagsDialog({
  title,
  subtitle,
  note,
  initialTagIds,
  isPending,
  error,
  onSave,
  onClose,
}: {
  title: string;
  subtitle: ReactNode;
  /** Что произойдёт с этими тегами дальше — только там, где это неочевидно. */
  note?: ReactNode;
  initialTagIds: string[];
  isPending: boolean;
  error?: string | null;
  onSave: (tagIds: string[]) => void;
  onClose: () => void;
}) {
  const { data: tagsData } = useTags();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTagIds));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={title} subtitle={subtitle} />
        <DialogBody>
          <TagPicker tags={tagsData?.tags ?? []} selected={selected} onToggle={toggle} />
          {note && <p className="foot">{note}</p>}
          {error && <p className="neg" style={{ marginTop: 'var(--s2)' }}>{error}</p>}
        </DialogBody>
        <DialogFooter>
          <button className="btn bare" onClick={onClose}>
            Отмена
          </button>
          <button className="btn solid" disabled={isPending} onClick={() => onSave([...selected])}>
            {isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
