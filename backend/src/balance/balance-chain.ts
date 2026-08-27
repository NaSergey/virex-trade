/**
 * Арифметика ряда баланса, вынесенная из сервисов: ни Prisma, ни сети, ни
 * часов. Здесь живёт единственная формула подсистемы, и здесь же её можно
 * прогнать на бумажном примере.
 */

/** Изменение баланса от торговли: закрытая прибыль за вычетом комиссий, фандинг. */
export interface Flow {
  at: Date;
  amount: number;
}

/** Точка, в которой баланс известен: снимок с биржи или начало отрезка. */
export interface Anchor {
  at: Date;
  balance: number;
}

/**
 * Сумма потоков в полуинтервале (from, to].
 *
 * Левая граница исключена намеренно: поток, стоящий ровно в момент якоря,
 * уже учтён в самом якоре. Включить его значило бы посчитать одну сделку
 * дважды, а сдвинутый на её размер ряд код прочитает как ввод средств.
 */
export function sumFlows(flows: Flow[], from: Date, to: Date): number {
  const a = from.getTime();
  const b = to.getTime();
  let sum = 0;
  for (const f of flows) {
    const t = f.at.getTime();
    if (t > a && t <= b) sum += f.amount;
  }
  return sum;
}

/**
 * Баланс в произвольный момент, выведенный от якоря.
 *
 * Направление не важно: вперёд потоки прибавляются, назад — вычитаются. Одна
 * формула на оба случая держит реконструкцию истории и текущий ряд на общем
 * коде, вместо двух почти одинаковых, расходящихся при первой же правке.
 */
export function deriveBalanceAt(anchor: Anchor, flows: Flow[], at: Date): number {
  if (at.getTime() >= anchor.at.getTime()) {
    return anchor.balance + sumFlows(flows, anchor.at, at);
  }
  return anchor.balance - sumFlows(flows, at, anchor.at);
}

/**
 * Неторговое изменение баланса: сколько денег появилось или исчезло помимо
 * торговли. Положительное — ввод, отрицательное — вывод.
 *
 * Null означает «расхождения нет», а не «ноль»: разрыв в ноль рублей и
 * отсутствие разрыва — разные вещи для того, кто читает ряд.
 */
export function detectGap(expected: number, actual: number, tolerance: number): number | null {
  const diff = actual - expected;
  if (Math.abs(diff) <= tolerance) return null;
  return diff;
}
