import type { EquityPoint } from '@/entities/trade';

// Холст в условных единицах: ширина совпадает с наборной полосой, поэтому в
// разметке кривая уходит в край вьюпорта (см. .bleed) без искажения пропорций —
// viewBox масштабируется целиком, а не растягивается по одной оси.
export const W = 1360;
// Поля холста сверху и снизу. Были вдвое шире — с тех пор как подписи ушли с
// холста в табличку наведения, держать под них место незачем: сверху поле
// нужно кривой на рекорде, снизу — чтобы вертикаль курсора не упиралась
// в край. Всё, что шире, кривая теряет в высоте.
export const PT = 14;
export const PB = 14;

/** Одна яма: от вершины, с которой пошли вниз, до возврата к ней. */
export interface Underwater {
  /** Заливка между линией рекорда и кривой — форма самой ямы. */
  path: string;
  /** Уровень воды: горизонталь рекорда над этой ямой и только над ней. */
  water: { x1: number; x2: number; y: number };
  /** Глубина в деньгах: рекорд минус дно. */
  depth: number;
  /** Вершина, с которой начали падать. */
  fromIdx: number;
  troughIdx: number;
  /** Возврат к вершине, а без возврата — последняя сделка. */
  endIdx: number;
  recovered: boolean;
  peakValue: number;
  troughValue: number;
}

/**
 * Геометрия кривой — чистой функцией: её можно прогнать на данных и убедиться,
 * что точки и подписи лежат внутри холста, а пути не содержат NaN.
 */
export function buildEquityGeometry(data: EquityPoint[], height: number) {
  if (data.length === 0) return null;

  const values = data.map((p) => p.value);
  const n = values.length;
  // Ноль всегда в кадре: кривая целиком в плюсе должна показывать, насколько
  // она от нуля оторвалась.
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  // Запас над максимумом и под минимумом — чтобы вершина кривой не касалась
  // края холста. Дальше этого его увеличивать нельзя: запас идёт из той же
  // высоты, что и сам размах, и на 14 % с каждой стороны кривая уже читалась
  // приплюснутой.
  const pad = (max - min) * 0.09 || 1;
  min -= pad;
  max += pad;

  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => PT + (1 - (v - min) / (max - min)) * (height - PT - PB);

  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const area =
    n > 1
      ? `M${line.replaceAll(' ', ' L')} L${x(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`
      : '';

  // Рекорд, достигнутый к этому моменту: он только растёт, и всё, что
  // провалилось под него, и есть просадка.
  const peaks: number[] = [];
  let running = -Infinity;
  for (const v of values) {
    running = Math.max(running, v);
    peaks.push(running);
  }

  // Все ямы, а не только худшая: кривая почти никогда не падает один раз, и
  // «во что обошлась эта серия» — вопрос к каждой из них. Внутри одной ямы
  // рекорд по определению постоянен (стоило его превысить — яма кончилась),
  // поэтому её верхняя граница горизонтальна.
  const underwater: Underwater[] = [];
  let i = 0;
  while (i < n) {
    if (values[i] >= peaks[i]) {
      i += 1;
      continue;
    }
    const peakValue = peaks[i];
    // Вершина — точка ПЕРЕД первой подводной: яма начинается с неё, иначе
    // заливка отрывалась бы от кривой на первой же ступеньке.
    const fromIdx = i - 1;
    let last = i;
    while (last + 1 < n && values[last + 1] < peakValue) last += 1;

    let troughIdx = i;
    for (let k = i; k <= last; k += 1) {
      if (values[k] < values[troughIdx]) troughIdx = k;
    }

    const recovered = last + 1 < n;
    // Возврат приходится между двумя сделками — берём точную точку пересечения
    // с линией рекорда, иначе у заливки справа остаётся зазубрина.
    const crossX = recovered
      ? x(last) +
        ((peakValue - values[last]) / (values[last + 1] - values[last])) * (x(last + 1) - x(last))
      : x(last);

    const curve = [];
    for (let k = fromIdx; k <= last; k += 1) curve.push(`${x(k).toFixed(1)},${y(k === fromIdx ? peakValue : values[k]).toFixed(1)}`);

    underwater.push({
      path: `M${curve.join(' L')} L${crossX.toFixed(1)},${y(peakValue).toFixed(1)} Z`,
      // Уровень воды чертится только над своей ямой: сплошная линия рекорда
      // через весь холст на подъёмах ложилась ровно на кривую и её грязнила.
      water: { x1: x(fromIdx), x2: crossX, y: y(peakValue) },
      depth: peakValue - values[troughIdx],
      fromIdx,
      troughIdx,
      endIdx: recovered ? last + 1 : n - 1,
      recovered,
      peakValue,
      troughValue: values[troughIdx],
    });

    i = last + 1;
  }

  // Насколько глубоко кривая сидела под рекордом в каждой точке: 0 — идёт по
  // рекорду, 1 — дно самой глубокой ямы за период. Отсюда растяжка цвета линии:
  // чем глубже просадка, тем краснее, а не «красная либо нет».
  //
  // Точки прорежены: на тысяче сделок тысяча остановок градиента ничего не
  // добавит глазу, но раздует разметку. Оставляем те, где глубина заметно
  // изменилась, и обязательно края ям — иначе выход из ямы размажется.
  const ddStops: { offset: number; ratio: number }[] = [];
  const worstDepth = Math.max(0, ...values.map((v, k) => peaks[k] - v));
  if (n > 1 && worstDepth > 0) {
    const ratioAt = (k: number) => (peaks[k] - values[k]) / worstDepth;
    let prev = -1;
    for (let k = 0; k < n; k += 1) {
      const r = ratioAt(k);
      const keep =
        k === 0 ||
        k === n - 1 ||
        Math.abs(r - ratioAt(prev)) >= 0.03 ||
        (r === 0) !== (ratioAt(prev) === 0);
      if (!keep) continue;
      ddStops.push({ offset: k / (n - 1), ratio: r });
      prev = k;
    }
  }

  // Худшая яма нужна только описанию графика для читалки: на самом холсте ямы
  // не подписаны и сравниваются площадью, а число называет наведение.
  const worstDrawdown = underwater.reduce<Underwater | null>(
    (worst, s) => (worst == null || s.depth > worst.depth ? s : worst),
    null,
  );

  return {
    x,
    y,
    points,
    line,
    area,
    zeroY,
    peak: Math.max(...values),
    ddStops,
    underwater,
    worstDrawdown,
    last: { x: x(n - 1), y: y(values[n - 1]), value: values[n - 1] },
  };
}

/** Готовая геометрия — то, с чем работают слои отрисовки. */
export type EquityGeometry = NonNullable<ReturnType<typeof buildEquityGeometry>>;

/**
 * Яма, в которой эта сделка сидит под водой. Ни вершина, с которой пошли вниз,
 * ни точка возврата к ней ямой не считаются: там кривая на рекорде, и просадки
 * в этот момент нет — называть её было бы враньём.
 */
export function dipAt(chart: EquityGeometry, i: number): Underwater | null {
  return (
    chart.underwater.find((s) => i > s.fromIdx && (s.recovered ? i < s.endIdx : i <= s.endIdx)) ?? null
  );
}
