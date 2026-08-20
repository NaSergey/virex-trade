/**
 * Разряды тонким пробелом: 118 420.50 читается с одного взгляда, 118420.50 —
 * нет. Пробел именно тонкий (U+2009), а не обычный: в моноширинной колонке
 * полный пробел рвёт число на два.
 */
function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Класс знака суммы: 'pos' — прибыль, 'neg' — убыток. Ноль относим к прибыли
 * (закрытие в безубыток — не потеря), как и подпись со знаком «+0.00».
 * @param v - сумма
 */
export function moneyClass(v: number): 'pos' | 'neg' {
  return v >= 0 ? 'pos' : 'neg';
}

/**
 * Деньги в журнале: знак всегда явный (плюс у прибыли, типографский минус
 * U+2212 у убытка — дефис в моно-колонке слишком похож на тире и на перенос),
 * два знака после запятой, разряды разбиты.
 *
 * Одна форма на весь продукт: свод, таблицы, диалоги и подписи графика
 * показывают одно и то же число одинаково.
 * @param v - сумма
 * @param digits - знаков после точки (по умолчанию 2)
 */
export function formatMoney(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const [int, frac] = Math.abs(v).toFixed(digits).split('.');
  return `${v >= 0 ? '+' : '−'}${group(int)}${frac ? `.${frac}` : ''}`;
}

/**
 * Цена без знака, но с разбитыми разрядами и той же точностью, что и
 * formatPrice (мелкие инструменты — 4 знака, остальные — 2).
 * @param value - цена числом или строкой с биржи
 */
export function formatPriceGrouped(value: string | number | null | undefined): string {
  const plain = formatPrice(value);
  if (plain === '-') return '—';
  const [int, frac] = plain.split('.');
  return `${group(int)}${frac ? `.${frac}` : ''}`;
}

/**
 * Количество монет: столько знаков, сколько есть на самом деле, без хвоста
 * двоичной дроби.
 *
 * Размер позиции складывается из её частей (`3.7 + 3.7 + 1.7`), и в двоичной
 * дроби это даёт `9.100000000000001` — в колонке чисел такая строка выглядит
 * как сбой расчёта, хотя это ровно 9.1. Восемь знаков — предел, который
 * вообще бывает у шага лота; всё, что за ним, — мусор представления, а не
 * данные.
 *
 * Отдельно от formatPrice: у цены точность фиксированная (2 или 4 знака), а у
 * количества значащих знаков столько, сколько дал инструмент — «1200» нельзя
 * показать как «1200.00», а «0.001» как «0.00».
 * @param value - количество числом или строкой с биржи
 */
export function formatQty(value: string | number | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || !Number.isFinite(num)) return '—';
  // Хвостовые нули срезаются вместе с точкой: toFixed их дописывает всем.
  const abs = Math.abs(num).toFixed(8).replace(/\.?0+$/, '');
  const [int, frac] = abs.split('.');
  return `${num < 0 ? '−' : ''}${group(int)}${frac ? `.${frac}` : ''}`;
}

/**
 * Format number with appropriate decimal places
 * - If number < 1 (e.g., 0.234235): show 4 decimal places
 * - If number >= 1 (e.g., 98097.70): show 2 decimal places
 * @param value - Number or string to format
 * @returns Formatted string
 */
export function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return '-';
  }

  // If number has no integer part (less than 1), show 4 decimal places, otherwise show 2
  if (Math.abs(num) < 1) {
    return num.toFixed(4);
  }

  return num.toFixed(2);
}

/**
 * Format an ISO date string as a short day/month, hour:minute string.
 * @param iso - ISO date string
 * @param locale - BCP-47 локаль для Intl (по умолчанию 'ru-RU')
 * @returns Formatted date string
 */
export function formatTradeDate(iso: string, locale = 'ru-RU'): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Профит-фактор в читаемом виде — одна формулировка на все места, где он
 * показывается (обзор, таблица тегов, лаборатория): «1.80», «∞» (убыточных
 * сделок нет, но прибыльные есть) и «—» (считать не из чего: сделок нет либо
 * все в ноль).
 * @param profitFactor - grossProfit / grossLoss
 * @param wins - прибыльных сделок
 * @param losses - убыточных сделок
 */
export function formatProfitFactor(profitFactor: number, wins: number, losses: number): string {
  if (losses === 0) return wins > 0 ? '∞' : '—';
  return profitFactor.toFixed(2);
}

/**
 * Проценты со знаком: «+2.35 %» / «−1.10 %». Минус и отбивка перед знаком
 * процента — те же, что у денег (см. formatMoney): одна типографика на все
 * величины со знаком.
 * @param v - значение в процентах
 * @param digits - знаков после точки (по умолчанию 2)
 */
export function fmtPctSigned(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)} %`;
}

/**
 * Русское склонение существительного при числе: 1 списание, 2 списания,
 * 5 списаний. Числительное само не подставляется — вызывающий ставит его
 * там, где нужно, и волен показать его иначе (например, «—»).
 * @param n - число, по которому склоняем
 * @param one - форма при 1 (списание)
 * @param few - форма при 2–4 (списания)
 * @param many - форма при 0 и 5+ (списаний)
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  // 11–14 идут по форме «many» вопреки последней цифре: одиннадцать списаний,
  // а не одиннадцать списание.
  if (abs >= 11 && abs <= 14) return many;
  const last = abs % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
