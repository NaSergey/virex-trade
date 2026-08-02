'use client';

import { useState } from 'react';
import { TAG_TYPES, TAG_TYPE_LABELS, useCreateTag, type TagType } from '@/entities/tag';
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
        placeholder="новый тег"
        aria-label="Название нового тега"
        maxLength={30}
        style={{ width: 180 }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <Select value={type} onChange={(e) => setType(e.target.value as TagType)}>
        {TAG_TYPES.map((t) => (
          <option key={t} value={t}>
            {TAG_TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
      <Button variant="solid" disabled={!name.trim() || create.isPending} onClick={submit}>
        Создать
      </Button>
      <ErrorNote as="span" error={create.error} fallback="Не удалось создать тег" />
    </div>
  );
}
