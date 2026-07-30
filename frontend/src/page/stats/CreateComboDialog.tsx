'use client';

import { useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { TagPicker } from '@/shared/ui/TagPicker';
import type { TagItem } from '@/shared/api/tags/hooks';

/**
 * Комбинация вручную: набор из двух и более тегов, посчитанный по сделкам, где
 * встретились все они (независимо от прочих тегов на сделке).
 *
 * Нужна для сочетания, которое ещё ни разу не встречалось вместе, — сама
 * система такое не предложит, а проверить гипотезу заранее осмысленно.
 */
export function CreateComboDialog({
  tags,
  isPending,
  onCreate,
  onClose,
}: {
  tags: TagItem[];
  isPending: boolean;
  onCreate: (tagIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        <DialogHeader
          title="Новая комбинация"
          subtitle="Выберите два и более тега — статистика посчитается по сделкам, где они встретились вместе"
        />
        <DialogBody>
          <TagPicker tags={tags} selected={selected} onToggle={toggle} />
        </DialogBody>
        <DialogFooter>
          <button className="btn bare" onClick={onClose}>
            Отмена
          </button>
          <button className="btn solid" disabled={selected.size < 2 || isPending} onClick={() => onCreate([...selected])}>
            Создать
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
