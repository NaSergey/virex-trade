/**
 * Шанс дойти до тейка раньше стопа на рынке без перекоса (спека 2026-10-25):
 * |цена − стоп| / (|цена − стоп| + |тейк − цена|), в процентах. Планка, а не
 * прогноз: сетап, который её не перебивает, на дистанции в минусе (без
 * комиссий). Цены — в одних единицах, экранных или настоящих: отношение от
 * масштаба не зависит. Тейк и стоп по одну сторону от цены — null.
 */
export function takeOdds(price: number, stop: number, take: number): number | null {
  const toStop = price - stop;
  const toTake = take - price;
  if (!(stop > 0) || !(take > 0) || toStop === 0 || toTake === 0 || Math.sign(toStop) !== Math.sign(toTake)) return null;
  return (Math.abs(toStop) / (Math.abs(toStop) + Math.abs(toTake))) * 100;
}
