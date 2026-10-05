'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TAG_TYPES, type TagItem, type TagType } from '../api/types';
import { useCreateTag } from '../api/hooks';
import { useTagTypeLabels } from './useTagTypeLabels';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { ErrorNote } from '@/shared/ui/ErrorNote';

/**
 * Создание тега — имя и категория, и всё. Цвет не выбирается: его назначает
 * сервер (см. TagsService.pickColor), чтобы два тега не оказались одного
 * оттенка и палитра не расползалась.
 *
 * Живёт в двух местах: строкой раздела «Теги» (`.newrow-r`, правая половина
 * общей строки с поиском) и в диалоге тегов сделки. `onCreated` нужен только
 * диалогу — он сразу отмечает новый тег у сделки.
 */
export function NewTagRow({
  onCreated,
  onCancel,
  full,
}: {
  onCreated?: (tag: TagItem) => void;
  /** В диалоге — «Отмена» рядом с «Создать»; на странице тегов её нет. */
  onCancel?: () => void;
  /** Во всю ширину окна: поле растягивается, ширина не фиксируется. */
  full?: boolean;
}) {
  const tc = useTranslations('common');
  const t = useTranslations('tags');
  const typeLabels = useTagTypeLabels();
  const [name, setName] = useState('');
  const [type, setType] = useState<TagType>('setup');
  const create = useCreateTag();

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), type },
      {
        onSuccess: (res) => {
          setName('');
          onCreated?.(res.tag);
        },
      },
    );
  };

  return (
    <div className={full ? 'newrow-r newrow-full' : 'newrow-r'}>
      {/* Подпись — плейсхолдером, а не отдельным словом слева: рядом стоит
          поиск, тоже подписанный изнутри, и два поля в строке должны
          объясняться одинаково. aria-label держит имя для скринридера,
          которому плейсхолдер исчезает вместе с первой набранной буквой. */}
      <Input
        placeholder={t('newTagPlaceholder')}
        aria-label={t('newTagAriaLabel')}
        maxLength={30}
        style={full ? undefined : { width: 180 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <Select value={type} onChange={(e) => setType(e.target.value as TagType)}>
        {TAG_TYPES.map((tt) => (
          <option key={tt} value={tt}>
            {typeLabels[tt]}
          </option>
        ))}
      </Select>
      {onCancel && (
        <Button variant="bare" onClick={onCancel}>
          {tc('cancel')}
        </Button>
      )}
      <Button variant="solid" disabled={!name.trim() || create.isPending} onClick={submit}>
        {t('create')}
      </Button>
      <ErrorNote as="span" error={create.error} fallback={t('createTagFailed')} />
    </div>
  );
}
