'use client';

import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { useIdSet } from '@/shared/lib/hooks/useIdSet';
import { TagPicker, type TagItem } from '@/entities/tag';

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
  const { selected, toggle, ids } = useIdSet();

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
        <DialogActions
          confirmLabel="Создать"
          confirmDisabled={selected.size < 2 || isPending}
          onConfirm={() => onCreate(ids)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
