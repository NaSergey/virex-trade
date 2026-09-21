/**
 * Сезон Battle Pass — календарный квартал UTC.
 *
 * Таблицы сезонов нет намеренно. Сезон, который кто-то должен создать заранее,
 * это ещё одно место, где забытая запись останавливает продукт: без строки
 * следующего квартала XP перестал бы начисляться молча. Квартал же известен из
 * календаря, и «сезон начался» — не событие, а смена ключа, по которому
 * пишется прогресс. Тот же приём, что у визитов в админке: выводится, а не
 * хранится.
 */

/** Ключ сезона: '2026-Q4'. */
export function seasonKey(date: Date): string {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Границы сезона. `endsAt` — последний его миг, а не первый миг следующего:
 * это число показывается человеку как срок, и «до 1 января» вместо
 * «до 31 декабря» он прочитал бы как лишний день.
 */
export function seasonBounds(key: string): { startsAt: Date; endsAt: Date } {
  const [year, quarter] = key.split('-Q').map(Number);
  const firstMonth = (quarter - 1) * 3;
  return {
    startsAt: new Date(Date.UTC(year, firstMonth, 1)),
    endsAt: new Date(Date.UTC(year, firstMonth + 3, 1) - 1),
  };
}
