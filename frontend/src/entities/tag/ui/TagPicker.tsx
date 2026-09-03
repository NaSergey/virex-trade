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

/**
 * '#6366f1' → '99 102 241' — форма, которую ждёт `rgb(… / α)` в globals.css
 * (там же так устроен `--ink-rgb`). Нужна, чтобы подсветка выбранного тега
 * шла его собственным цветом с прозрачностью: сам hex для этого не годится.
 *
 * Цвет в базе выдаёт сервер из своей палитры, но формат здесь всё равно
 * проверяется: строка из БД может быть какой угодно, а невалидное значение в
 * CSS-переменной гасит всё правило целиком, а не только подсветку.
 */
function rgbTriplet(hex: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
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
      <div>
        {group.map((t) => {
          const rgb = rgbTriplet(t.color);
          return (
            <Button
              key={t.id}
              variant="none"
              className="pick"
              aria-pressed={selected.has(t.id)}
              style={
                {
                  borderColor: t.color,
                  // Тем же цветом светится выбранный тег — см. `.pick` в globals.css.
                  ...(rgb ? { '--tag-rgb': rgb } : {}),
                } as React.CSSProperties
              }
              onClick={() => onToggle(t.id)}
            >
              {t.name}
            </Button>
          );
        })}
      </div>
    </FieldGroup>
  );
}
