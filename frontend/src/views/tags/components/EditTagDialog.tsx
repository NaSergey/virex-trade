'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Seg } from '@/shared/ui/Seg';
import { Field, FieldGroup, Input } from '@/shared/ui/Field';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TAG_TYPES, useUpdateTag, useTagTypeLabels, type TagItem, type TagType } from '@/entities/tag';

/**
 * Правка тега: имя и категория. Связи с сделками остаются на месте, статистика
 * продолжает считаться — поэтому переименование безопасно и не требует
 * подтверждения словом, в отличие от удаления.
 */
export function EditTagDialog({ tag, onClose }: { tag: TagItem; onClose: () => void }) {
  const t = useTranslations('tags');
  const tc = useTranslations('common');
  const typeLabels = useTagTypeLabels();
  const TYPE_OPTIONS = TAG_TYPES.map((tt) => ({ value: tt, label: typeLabels[tt] }));
  const [name, setName] = useState(tag.name);
  const [type, setType] = useState<TagType>(tag.type ?? 'setup');
  const update = useUpdateTag();

  const submit = () => {
    if (!name.trim()) return;
    update.mutate({ id: tag.id, name: name.trim(), type }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader
          title={t('editTagTitle')}
          subtitle={t('editTagSubtitle', { name: tag.name, n: tag.tradesCount ?? 0 })}
        />
        <DialogBody>
          <Field label={t('nameLabel')} htmlFor="tag-name">
            <Input
              id="tag-name"
              full
              maxLength={30}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
          <FieldGroup label={t('colCategory')}>
            <Seg options={TYPE_OPTIONS} value={type} onChange={setType} ariaLabel={t('categoryAriaLabel')} />
          </FieldGroup>
          <ErrorNote error={update.error} fallback={t('saveTagFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={update.isPending ? tc('saving') : tc('save')}
          confirmDisabled={!name.trim() || update.isPending}
          onConfirm={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
