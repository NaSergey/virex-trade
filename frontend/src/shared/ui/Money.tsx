'use client';

import { cn } from '@/shared/lib/utils/css';
import { formatMoney, moneyClass } from '@/shared/lib/utils/format';

/**
 * Сумма в журнале: форма числа и цвет знака — всегда вместе.
 *
 * Это одна величина, а не две независимые: `formatMoney` ставит знак, а
 * `moneyClass` его красит, и любое место, где вызвали одно без другого, врёт —
 * убыток без цвета читается наравне с прибылью. Пока пара писалась руками, она
 * стояла в шести таблицах, и в двух из них к ней ещё и приписывали кегль
 * инлайном.
 *
 * Цвета всего два и означают они только деньги — поэтому «нейтральной» суммы
 * здесь нет: ноль относится к прибыли (см. moneyClass).
 */
export function Money({
  value,
  /** Итог строки — набирается крупнее прочих чисел (.money-l). */
  large,
  /** «USDT» и подобное: единица отбивается от числа, но не красится. */
  unit,
  className,
}: {
  value: number;
  large?: boolean;
  unit?: string;
  className?: string;
}) {
  return (
    <span className={cn(moneyClass(value), large && 'money-l', className)}>
      {formatMoney(value)}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}
