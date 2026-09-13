'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useIdSet } from '@/shared/lib/hooks/useIdSet';
import { useTags } from '../api/hooks';
import { TagPicker } from './TagPicker';

/**
 * Разметка тегами — один диалог на любую привязку (закрытая сделка обзора,
 * открытая позиция обзора, сделка бектеста): разница только в том, к чему
 * крепится набор и что об этом сказано в подзаголовке/note — всё остальное
 * тот же выбор из тех же тегов, поэтому один компонент, а не несколько похожих.
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
            fallback={tc('saveTagsFailed')}
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
