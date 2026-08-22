'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TAG_TYPES, useCreateTag, useTagTypeLabels, type TagType } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { ErrorNote } from '@/shared/ui/ErrorNote';

/**
 * Создание тега — имя и категория, и всё. Цвет не выбирается: его назначает
 * сервер (см. TagsService.pickColor), чтобы два тега не оказались одного
 * оттенка и палитра не расползалась.
 *
 * Своей строки не заводит — встаёт правой половиной в общую строку раздела
 * (`.newrow` в AllTags), напротив поиска: слева отбирают из того, что есть,
 * справа добавляют новое.
 */
export function NewTagRow() {
  const t = useTranslations('tags');
  const typeLabels = useTagTypeLabels();
  const [name, setName] = useState('');
  const [type, setType] = useState<TagType>('setup');
  const create = useCreateTag();

  const submit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), type }, { onSuccess: () => setName('') });
  };

  return (
    <div className="newrow-r">
      {/* Подпись — плейсхолдером, а не отдельным словом слева: рядом стоит
          поиск, тоже подписанный изнутри, и два поля в строке должны
          объясняться одинаково. aria-label держит имя для скринридера,
          которому плейсхолдер исчезает вместе с первой набранной буквой. */}
      <Input
        placeholder={t('newTagPlaceholder')}
        aria-label={t('newTagAriaLabel')}
        maxLength={30}
        style={{ width: 180 }}
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
      <Button variant="solid" disabled={!name.trim() || create.isPending} onClick={submit}>
        {t('create')}
      </Button>
      <ErrorNote as="span" error={create.error} fallback={t('createTagFailed')} />
    </div>
  );
}
