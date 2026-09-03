'use client';

import { useTranslations } from 'next-intl';
import { TAG_TYPES, type TagItem, type TagType } from '@/entities/tag/api/types';
import { useTagTypeLabels } from './useTagTypeLabels';
import { Button } from '@/shared/ui/Button';
import { FieldGroup } from '@/shared/ui/Field';

/**
 * Выбор тегов в диалоге — по одной группе на категорию (сетап / эмоция /
 * ошибка). Категория тут не украшение: она отвечает на «что я вообще должен
 * отметить», поэтому группы всегда все три, даже если в какой-то тегов нет.
 *
 * Сам элемент выбора — подчёркнутое слово, а не чекбокс с пилюлей: выбранное
 * горит краской, невыбранное молчит.
 */
export function TagPicker({
  tags,
  selected,
  onToggle,
}: {
  tags: TagItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations('tags');
  return (
    <>
      {TAG_TYPES.map((type) => (
        <TagPickerGroup key={type} type={type} tags={tags} selected={selected} onToggle={onToggle} />
      ))}
      {tags.length === 0 && <p className="muted">{t('noTagsYet')}</p>}
    </>
  );
}

function TagPickerGroup({
  type,
  tags,
  selected,
  onToggle,
}: {
  type: TagType;
  tags: TagItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const typeLabels = useTagTypeLabels();
  const group = tags.filter((t) => (t.type ?? 'setup') === type);
  if (group.length === 0) return null;

  return (
    <FieldGroup label={typeLabels[type]}>
      <div className="pick-row">
        {group.map((t) => (
          <Button
            key={t.id}
            variant="none"
            className="pick"
            aria-pressed={selected.has(t.id)}
            /* Краска — только у выбранного: у молчащего тега подчёркивание
               нейтральное, из CSS. Иначе два десятка цветных линий горят
               одинаково и по ним не прочитать, что именно отмечено. */
            style={selected.has(t.id) ? { borderBottomColor: t.color } : undefined}
            onClick={() => onToggle(t.id)}
          >
            {t.name}
          </Button>
        ))}
      </div>
    </FieldGroup>
  );
}
