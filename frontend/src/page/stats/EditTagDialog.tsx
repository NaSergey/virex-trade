'use client';

import { useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { Seg } from '@/shared/ui/Seg';
import { TAG_TYPES, TAG_TYPE_LABELS, useUpdateTag, type TagItem, type TagType } from '@/shared/api/tags/hooks';

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
          <div className="field">
            <label className="lbl" htmlFor="tag-name">
              Название
            </label>
            <input
              id="tag-name"
              className="in full"
              maxLength={30}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="field">
            <span className="lbl">Категория</span>
            <Seg options={TYPE_OPTIONS} value={type} onChange={setType} ariaLabel="Категория тега" />
          </div>
          {update.isError && <p className="neg">{(update.error as Error).message}</p>}
        </DialogBody>
        <DialogFooter>
          <button className="btn bare" onClick={onClose}>
            Отмена
          </button>
          <button className="btn solid" disabled={!name.trim() || update.isPending} onClick={submit}>
            {update.isPending ? 'Сохранение…' : 'Сохранить'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
