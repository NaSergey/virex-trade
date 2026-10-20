import type { HlWalletRow } from '../api/hooks';

/** Числовые фильтры: «от» (`Min`) и «до» (`Max`) — по смыслу колонки. Поля — строки, как их вводят. */
export type NumFilterKey =
  | 'balanceMin'
  | 'pnlWeekMin'
  | 'pnlMonthMin'
  | 'pnl90Min'
  | 'pnlAllMin'
  | 'roiMin'
  | 'upShareMin'
  | 'bestWeekMax'
  | 'drawdownMax'
  | 'tMin';

export type ViewFilter = 'all' | 'new' | 'viewed';

/** `directional` — только кошельки с перекосом в одну сторону; хедж, пары и пустые уходят. */
export type StyleFilter = 'all' | 'directional';

export type WalletFilters = Record<NumFilterKey, string> & { view: ViewFilter; style: StyleFilter };

export const EMPTY_FILTERS: WalletFilters = {
  balanceMin: '',
  pnlWeekMin: '',
  pnlMonthMin: '',
  pnl90Min: '',
  pnlAllMin: '',
  roiMin: '',
  upShareMin: '',
  bestWeekMax: '',
  drawdownMax: '',
  tMin: '',
  view: 'all',
  style: 'all',
};

/** Пусто или не число — фильтр не действует: наполовину набранное «-» не должно прятать таблицу. */
function parse(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return raw.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** `0.35 * 100` в двоичной дроби — 35.00000000000001, и граница «до 35» ошибалась бы на ровном значении. */
const scaled = (v: number, scale: number) => +(v * scale).toFixed(6);

export function hasFilters(f: WalletFilters): boolean {
  return (
    f.view !== 'all' ||
    f.style !== 'all' ||
    (Object.keys(f) as (keyof WalletFilters)[]).some((k) => k !== 'view' && k !== 'style' && parse(f[k]) != null)
  );
}

/**
 * Отбор строк на клиенте — их сотни, и приходят все. Проценты вводятся числом
 * («20» — двадцать процентов), как их и показывает таблица. Число, которого у
 * кошелька ещё нет, под заданный фильтр не проходит: «не знаем» не равно «подходит».
 */
export function applyFilters(rows: HlWalletRow[], f: WalletFilters): HlWalletRow[] {
  const min = (v: number | null, raw: string, scale = 1) => {
    const n = parse(raw);
    return n == null || (v != null && scaled(v, scale) >= n);
  };
  const max = (v: number | null, raw: string, scale = 1) => {
    const n = parse(raw);
    return n == null || (v != null && scaled(v, scale) <= n);
  };
  return rows.filter((r) => {
    if (f.view === 'new' && r.viewedAt) return false;
    if (f.view === 'viewed' && !r.viewedAt) return false;
    if (f.style === 'directional' && r.style !== 'directional') return false;
    const upShare = r.weeksMoving ? (r.weeksUp ?? 0) / r.weeksMoving : null;
    return (
      min(r.weeklyT, f.tMin) &&
      min(r.accountValue, f.balanceMin) &&
      min(r.pnlWeek, f.pnlWeekMin) &&
      min(r.pnlMonth, f.pnlMonthMin) &&
      min(r.pnl90, f.pnl90Min) &&
      min(r.pnlAllTime, f.pnlAllMin) &&
      min(r.roiMonth, f.roiMin, 100) &&
      min(upShare, f.upShareMin, 100) &&
      max(r.bestWeekShare, f.bestWeekMax, 100) &&
      max(r.maxDrawdown, f.drawdownMax, 100)
    );
  });
}
