'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/utils/css';

/**
 * Род кнопки, а не её оттенок: каждый вариант отвечает на «чем это является в
 * разговоре с пользователем», поэтому их немного и они не смешиваются.
 *
 * - `default` — обычное действие в рамке;
 * - `solid` — главное действие формы или диалога, одно на экран;
 * - `bare` — действие в строке текста: рамки нет, подчёркивание по наведению;
 * - `risk` — необратимое, в цвете убытка;
 * - `add`  — «+ тег» рядом с пилюлями: пунктир, садится на их линию;
 * - `none` — кнопка со своей полной разметкой (`.pick`): общий класс не нужен,
 *   но нужны type="button" и единый набор пропсов.
 */
export type ButtonVariant = 'default' | 'solid' | 'bare' | 'risk' | 'add' | 'none';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: 'btn',
  solid: 'btn solid',
  bare: 'btn bare',
  risk: 'btn risk',
  add: 'tag-add',
  none: '',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Снимает паддинг и рамку — кнопка встаёт в строку заголовка как обычный текст. */
  tight?: boolean;
}

/**
 * Единственная кнопка продукта.
 *
 * Раньше `<button className="btn …">` писалась в пятнадцати местах, и каждое
 * могло разойтись с остальными в мелочи, которая не видна на глаз: забытый
 * `type="button"` внутри `<form>` отправляет форму вместо своего onClick, а
 * набор классов приходилось помнить наизусть.
 *
 * Здесь и то и другое — по умолчанию: тип задан явно, а вид выбирается
 * вариантом, а не строкой классов.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', tight, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Внутри <form> кнопка без type сабмитит форму — умолчание HTML, о котором
      // забывают. Явный submit по-прежнему доступен через проп.
      type={type ?? 'button'}
      className={cn(VARIANT_CLASS[variant], tight && 'tight', className) || undefined}
      {...rest}
    />
  );
});
