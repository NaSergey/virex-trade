'use client';

import type { CSSProperties } from 'react';
import { errorMessage } from '@/shared/lib/utils/error';

/**
 * Ошибка действия — строкой в цвете убытка, рядом с тем, что не получилось.
 *
 * Ничего не рисует, пока ошибки нет: у вызывающего остаётся один узел вместо
 * пары «условие && абзац», и негде забыть условие.
 *
 * `span` — для ошибки внутри строки полей (`.newrow-r`), где абзац разорвал бы
 * строку надвое.
 */
export function ErrorNote({
  error,
  fallback,
  as = 'p',
  style,
}: {
  /** Что поймали; null/undefined — компонент не рендерится. */
  error: unknown;
  /** Обязателен: без него запасной текст неоткуда перевести (см. errorMessage). */
  fallback: string;
  as?: 'p' | 'span';
  style?: CSSProperties;
}) {
  if (error == null) return null;
  const Tag = as;
  return (
    <Tag className="neg" style={style}>
      {errorMessage(error, fallback)}
    </Tag>
  );
}
