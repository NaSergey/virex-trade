'use client';

import { memo, type ReactNode } from 'react';

export interface TagLike {
  id: string;
  name: string;
  color: string;
}

/**
 * Тег — не пилюля. Название краской, подчёркивание — цветом тега: цвет
 * опознаёт метку, но не заливает собой строку журнала и не спорит с зелёным и
 * красным, которые в этой системе означают только деньги.
 */
export const Tag = memo(({ name, color }: { name: string; color: string }) => (
  <span className="tag" style={{ borderColor: color }}>
    <em>{name}</em>
  </span>
));
Tag.displayName = 'Tag';

/** Ряд тегов; последним слотом обычно идёт кнопка «+ тег». */
export function Tags({ tags, children }: { tags: TagLike[]; children?: ReactNode }) {
  return (
    <span className="tags">
      {tags.map((t) => (
        <Tag key={t.id} name={t.name} color={t.color} />
      ))}
      {children}
    </span>
  );
}

/** Комбинация: теги через «+», как её и читают вслух. */
export function TagCombo({ names, colors }: { names: string[]; colors: string[] }) {
  return (
    <span className="tags">
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className="tags" style={{ gap: 'var(--s2)' }}>
          {i > 0 && <span className="lbl">+</span>}
          <Tag name={n} color={colors[i] ?? 'var(--color-muted)'} />
        </span>
      ))}
    </span>
  );
}
