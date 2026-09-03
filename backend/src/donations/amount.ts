import { UNITS_PER_USDT, USDT_DECIMALS } from './donation.config';

/**
 * Суммы доната и уникальный «хвост», по которому платёж узнаётся на общем
 * кошельке.
 *
 * Всё считается в минимальных единицах USDT (1e-6) целыми числами. Float здесь
 * недопустим: сопоставление строится на ТОЧНОМ равенстве сумм, а 5.0137 в
 * double — это 5.013699999999999, и перевод, совпавший до последнего знака,
 * не совпал бы с интентом.
 *
 * Шаг хвоста — 0.0001 USDT, слотов 99 (0.0001 … 0.0099). Выбор компромиссный:
 *  - шаг крупнее (0.001, как «5.013») читается человеком, но добавляет к сумме
 *    заметные центы — за поддержку проекта берут не так;
 *  - шаг мельче (0.000001) даёт миллион слотов, но такую сумму невозможно
 *    ввести в выводе многих бирж: они режут точность вывода USDT-TRC20.
 *
 * Верхняя граница выбрана так, чтобы хвост оставался СТРОГО НИЖЕ сотых, то
 * есть ниже знаков, которые вводит человек. Тогда диапазоны разных введённых
 * сумм не пересекаются: 5.00 не может получить хвост, попадающий в область
 * 5.01, и слоты одной суммы никогда не отнимают слоты у другой. Цена — 99
 * одновременно живущих интентов НА ОДНУ И ТУ ЖЕ введённую сумму; больше —
 * честный отказ «попробуйте через минуту», а не выдача неуникальной суммы.
 * Донору хвост стоит максимум 0.0099 USDT.
 */

/** Шаг хвоста в минимальных единицах: 0.0001 USDT. */
export const TAIL_STEP_UNITS = 100n;
/** Сколько разных хвостов существует: 0.0001 … 0.0099. */
export const TAIL_SLOTS = 99;
/** Хвост занимает младшие знаки — база округляется до сотых, ниже они свободны. */
export const BASE_GRANULARITY_UNITS = 10_000n; // 0.01 USDT

const AMOUNT_RE = /^\d{1,7}(\.\d{1,2})?$/;

/**
 * Разбирает сумму, введённую человеком: до 7 целых и не больше двух знаков
 * после запятой. Два знака — не каприз: младшие знаки отданы хвосту, и если
 * позволить вводить 5.0137 самому, введённая сумма столкнётся с чужим хвостом.
 * Возвращает null на любом мусоре — проверка формата и разбор здесь один раз.
 */
export function parseUsdtAmount(input: string): bigint | null {
  const trimmed = input.trim();
  if (!AMOUNT_RE.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const padded = (frac + '0'.repeat(USDT_DECIMALS)).slice(0, USDT_DECIMALS);
  return BigInt(whole) * UNITS_PER_USDT + BigInt(padded);
}

/**
 * Сумма строкой для показа и для ввода в кошелёк. Минимум два знака (5 → 5.00),
 * дальше — ровно столько, сколько несёт число: 5.0137, но не 5.013700.
 */
export function formatUsdt(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / UNITS_PER_USDT;
  const frac = (abs % UNITS_PER_USDT).toString().padStart(USDT_DECIMALS, '0');
  const trimmed = frac.replace(/0+$/, '');
  const shown = trimmed.length < 2 ? frac.slice(0, 2) : trimmed;
  return `${negative ? '-' : ''}${whole}.${shown}`;
}

/** Все возможные суммы с хвостом для данной базы, в случайном порядке. */
export function candidateAmounts(baseUnits: bigint): bigint[] {
  const tails = Array.from(
    { length: TAIL_SLOTS },
    (_, i) => BigInt(i + 1) * TAIL_STEP_UNITS,
  );
  for (let i = tails.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tails[i], tails[j]] = [tails[j], tails[i]];
  }
  return tails.map((t) => baseUnits + t);
}

/** Максимальная надбавка к сумме, о которой честно предупреждает интерфейс. */
export const MAX_TAIL_UNITS = BigInt(TAIL_SLOTS) * TAIL_STEP_UNITS;
