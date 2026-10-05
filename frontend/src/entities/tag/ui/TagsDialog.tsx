'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useIdSet } from '@/shared/lib/hooks/useIdSet';
import { useTags } from '../api/hooks';
import { NewTagRow } from './NewTagRow';
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
  const t = useTranslations('tags');
  const tc = useTranslations('common');
  const { data: tagsData } = useTags();
  const { selected, toggle, ids } = useIdSet(initialTagIds);
  const { closing, close } = useDialogFade(onClose);
  const [creating, setCreating] = useState(false);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader title={title} subtitle={subtitle} />
        <DialogBody>
          <TagPicker tags={tagsData?.tags ?? []} selected={selected} onToggle={toggle} />
          {/* Новый тег сразу отмечается у сделки: создавать его ради того, чтобы
              потом искать в списке и отмечать второй раз, — лишний шаг. */}
          {creating ? (
            <div className="tags-new-full">
              <NewTagRow full onCancel={() => setCreating(false)} onCreated={(tag) => { toggle(tag.id); setCreating(false); }} />
            </div>
          ) : (
            <div className="tags-new-toggle">
              <Button variant="bare" onClick={() => setCreating(true)}>
                {t('newTagOpen')}
              </Button>
            </div>
          )}
          {note && <p className="foot">{note}</p>}
          <ErrorNote
            error={error}
            fallback={tc('saveTagsFailed')}
            style={{ marginTop: 'var(--s2)' }}
          />
        </DialogBody>
        <DialogFooter className="df-pair">
          <Button variant="solid" disabled={isPending} onClick={() => onSave(ids)}>
            {isPending ? tc('saving') : tc('save')}
          </Button>
          <Button variant="bare" onClick={close}>
            {tc('back')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
