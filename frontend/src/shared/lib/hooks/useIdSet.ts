'use client';

import { useState } from 'react';

/**
 * Набор выбранных идентификаторов с переключением по одному.
 *
 * Выбор тегов устроен так в двух диалогах сразу (разметка сделки и создание
 * комбинации), и оба раза это был один и тот же десяток строк: скопировать Set,
 * добавить или убрать, вернуть новый. Копия обязательна — мутация того же Set
 * не меняет ссылку, и React не перерисовал бы список.
 * @param initial - что выбрано изначально
 */
export function useIdSet(initial: Iterable<string> = []) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return { selected, toggle, ids: [...selected] };
}
