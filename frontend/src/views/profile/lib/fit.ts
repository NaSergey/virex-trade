/**
 * Раскладка профиля в одно окно (спека 2026-10-16): содержимое вкладки забирает
 * остаток высоты, и строк на листе столько, сколько в него влезает. Чистые
 * функции — их проверяет vitest, а компоненты только меряют высоту.
 */

/**
 * Строка таблицы журнала (`.ledger td` — 40px, черта внутри: `border-collapse`).
 * Мерки ниже сняты в браузере, а не прикинуты: прикидка на пару пикселей
 * больше — и последняя строка листа срезается о край окна.
 */
export const ROW_H = 40;
/** Шапка таблицы (33) и листалка под ней (33 и отступ 16), с запасом в 2px. */
export const TABLE_RESERVE = 33 + 49 + 2;
/** Лист узкого окна: там страница листается, и мерить нечего. */
export const FALLBACK_ROWS = 8;

const MIN_ROWS = 3;
/** Больше сервер не отдаёт (`TRADES_PAGE_SIZE`). */
const MAX_ROWS = 20;

/**
 * Меньше этой высоты блок вкладки не сжимается: шапка, три строки и листалка.
 * Окно ниже — страница чуть листается, а не срезает таблицу молча.
 */
export const PANE_MIN = TABLE_RESERVE + MIN_ROWS * ROW_H;
/** Три ряда плашек достижений (76px) с промежутками (8px). */
const TILES_3_ROWS = 3 * 76 + 2 * 8;

/**
 * Сколько строк листа помещается в блок высотой `height`, если `reserve`
 * занято шапкой таблицы и листалкой. Не меньше трёх — таблица из одной строки
 * хуже срезанной снизу — и не больше двадцати. Высота 0 значит «не мерили»
 * (узкое окно, страница прокручивается) — тогда постоянный лист.
 */
export function rowsFor(height: number, reserve: number, min = MIN_ROWS): number {
  if (!(height > 0)) return FALLBACK_ROWS;
  return Math.max(min, Math.min(MAX_ROWS, Math.floor((height - reserve) / ROW_H)));
}

/** Лист `page` по `size` строк; номер за краями прижимается к первому или последнему листу. */
export function pageOf<T>(rows: T[], page: number, size: number): { items: T[]; page: number; total: number } {
  const last = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), last);
  return { items: rows.slice((current - 1) * size, current * size), page: current, total: rows.length };
}

/** Колонок у плашек достижений: три ряда не влезают — шесть колонок в два ряда. */
export const tileCols = (height: number): 4 | 6 => (height > 0 && height < TILES_3_ROWS ? 6 : 4);
