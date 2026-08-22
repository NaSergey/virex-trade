'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useIdSet } from '@/shared/lib/hooks/useIdSet';
import { TagPicker, useTags } from '@/entities/tag';

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
  /** Что вернула мутация сохранения; null — всё в порядке. */
  error?: unknown;
  onSave: (tagIds: string[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations('overview');
  const tc = useTranslations('common');
  const { data: tagsData } = useTags();
  const { selected, toggle, ids } = useIdSet(initialTagIds);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={title} subtitle={subtitle} />
        <DialogBody>
          <TagPicker tags={tagsData?.tags ?? []} selected={selected} onToggle={toggle} />
          {note && <p className="foot">{note}</p>}
          <ErrorNote
            error={error}
            fallback={t('saveTagsFailed')}
            style={{ marginTop: 'var(--s2)' }}
          />
        </DialogBody>
        <DialogActions
          confirmLabel={isPending ? tc('saving') : tc('save')}
          confirmDisabled={isPending}
          onConfirm={() => onSave(ids)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
