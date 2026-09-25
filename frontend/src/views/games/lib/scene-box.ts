/**
 * Геометрия слоёв сцен витрины. Сцена рисуется в координатах 384×514 (кадр
 * карточки), но каждая движущаяся вещь — отдельный HTML-слой со своим SVG:
 * движение HTML-слоя браузер отдаёт видеокарте, а движение узла внутри SVG
 * перерисовывает весь SVG на каждом кадре вместе со всеми размытиями. Здесь —
 * перевод рамок и точек поворота из координат сцены в проценты слоя.
 */

export const SCENE_W = 384;
export const SCENE_H = 514;

/** Рамка в координатах сцены. */
export type Box = { x: number; y: number; w: number; h: number };

export type Pt = [x: number, y: number];

export const FULL: Box = { x: 0, y: 0, w: SCENE_W, h: SCENE_H };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Точка в системе предмета (центр `c`, поворот `rot`) → координаты сцены. */
export function toScene(c: Pt, rot: number, [lx, ly]: Pt): Pt {
  const cos = Math.cos(rad(rot));
  const sin = Math.sin(rad(rot));
  return [c[0] + lx * cos - ly * sin, c[1] + lx * sin + ly * cos];
}

/** Углы прямоугольника w×h с центром `c`, повёрнутого на `rot`. */
export function rectCorners(c: Pt, w: number, h: number, rot: number): Pt[] {
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map((p) => toScene(c, rot, p as Pt));
}

/**
 * Рамка вокруг точек с запасом `margin` — под свечение и размытие, которые
 * выходят за контур предмета. Края округлены наружу до целых: слой на
 * дробной границе видеокарта сдвигает с пересэмплированием, и контур мылится.
 */
export function boxAround(points: Pt[], margin: number): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.floor(Math.min(...xs) - margin);
  const y = Math.floor(Math.min(...ys) - margin);
  return { x, y, w: Math.ceil(Math.max(...xs) + margin) - x, h: Math.ceil(Math.max(...ys) + margin) - y };
}

const pct = (v: number) => `${+v.toFixed(4)}%`;

/** Положение слоя в кадре — проценты сцены, чтобы слой тянулся вместе с карточкой. */
export function boxStyle(b: Box) {
  return {
    left: pct((b.x / SCENE_W) * 100),
    top: pct((b.y / SCENE_H) * 100),
    width: pct((b.w / SCENE_W) * 100),
    height: pct((b.h / SCENE_H) * 100),
  };
}

/** Точка сцены → `transform-origin` в процентах рамки слоя. */
export function originIn(b: Box, [x, y]: Pt): string {
  return `${pct(((x - b.x) / b.w) * 100)} ${pct(((y - b.y) / b.h) * 100)}`;
}

/** `viewBox` SVG слоя: та же рамка — рисунок внутри остаётся в координатах сцены. */
export const viewBoxOf = (b: Box) => `${b.x} ${b.y} ${b.w} ${b.h}`;
