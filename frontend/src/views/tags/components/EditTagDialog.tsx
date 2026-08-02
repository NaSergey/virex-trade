'use client';

import { useState } from 'react';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Seg } from '@/shared/ui/Seg';
import { Field, FieldGroup, Input } from '@/shared/ui/Field';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TAG_TYPES, TAG_TYPE_LABELS, useUpdateTag, type TagItem, type TagType } from '@/entities/tag';

const TYPE_OPTIONS = TAG_TYPES.map((t) => ({ value: t, label: TAG_TYPE_LABELS[t] }));

/**
 * Правка тега: имя и категория. Связи с сделками остаются на месте, статистика
 * продолжает считаться — поэтому переименование безопасно и не требует
 * подтверждения словом, в отличие от удаления.
 */
export function EditTagDialog({ tag, onClose }: { tag: TagItem; onClose: () => void }) {
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
          title="Правка тега"
          subtitle={`${tag.name} · на ${tag.tradesCount ?? 0} сделках · цвет назначен системой`}
        />
        <DialogBody>
          <Field label="Название" htmlFor="tag-name">
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
          <FieldGroup label="Категория">
            <Seg options={TYPE_OPTIONS} value={type} onChange={setType} ariaLabel="Категория тега" />
          </FieldGroup>
          <ErrorNote error={update.error} fallback="Не удалось сохранить тег" />
        </DialogBody>
        <DialogActions
          confirmLabel={update.isPending ? 'Сохранение…' : 'Сохранить'}
          confirmDisabled={!name.trim() || update.isPending}
          onConfirm={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
