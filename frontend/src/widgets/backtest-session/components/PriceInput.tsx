'use client';

import { useState } from 'react';
import { Input, type InputProps } from '@/shared/ui/Field';
import { parsePriceInput, toInputPrice } from '../lib/money';

/**
 * Поле цены уровня рядом с ползунком (сетка фиксации, окна правки уровней и
 * лимита закрытия). Текст — свой черновик, а не число родителя: с числом в
 * `value` каждое нажатие проходило `Number()` и переформатирование — набрать
 * цену было нельзя (после первой цифры «1.00000», точка давала NaN), а пустое
 * поле роняло страницу.
 *
 * Наружу уходит только разобранное положительное число (`parsePriceInput`);
 * пустое — `onClear`, если уровень необязателен, иначе родителя не трогает.
 * Ползунок или сброс, сдвинувшие значение снаружи, переписывают текст.
 */
export function PriceInput({
  value,
  onChange,
  onClear,
  ...rest
}: {
  value: number | null;
  onChange: (v: number) => void;
  /** Необязательный уровень (тейк): пустое поле его снимает. */
  onClear?: () => void;
} & Omit<InputProps, 'value' | 'onChange' | 'inputMode'>) {
  const [text, setText] = useState(() => (value != null ? toInputPrice(value) : ''));
  // Последнее значение, которое поле видело: своё (набранное) или пришедшее снаружи.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (parsePriceInput(text) !== value) setText(value != null ? toInputPrice(value) : '');
  }

  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parsePriceInput(raw);
        if (n != null) {
          setSeen(n);
          onChange(n);
        } else if (onClear && raw.trim() === '') {
          setSeen(null);
          onClear();
        }
      }}
    />
  );
}
