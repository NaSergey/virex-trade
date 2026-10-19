/**
 * Кисть сцены гонки. Контекст — модульная переменная, как в эскизе
 * (`2026-10-18-race-sketch.html`): фигур сотни, и передавать его каждой — шум.
 * Рисует сцена в один поток: кто рисует, тот сначала зовёт `paintOn`.
 */
export type RGB = [number, number, number];

export let G: CanvasRenderingContext2D;

export function paintOn(g: CanvasRenderingContext2D) {
  G = g;
}

export const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgb = (c: RGB, a?: number) =>
  a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const tint = (c: RGB, k: number): RGB => mix(c, [255, 255, 255], k);

export function quad(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) {
  G.beginPath();
  G.moveTo(x1, y1);
  G.lineTo(x2, y2);
  G.lineTo(x3, y3);
  G.lineTo(x4, y4);
  G.closePath();
  G.fill();
}

export function poly(a: number[]) {
  G.beginPath();
  G.moveTo(a[0], a[1]);
  for (let i = 2; i < a.length; i += 2) G.lineTo(a[i], a[i + 1]);
  G.closePath();
  G.fill();
}

export function ell(x: number, y: number, rx: number, ry: number) {
  G.beginPath();
  G.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  G.fill();
}

export function ellS(x: number, y: number, rx: number, ry: number) {
  G.beginPath();
  G.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  G.stroke();
}

export function circ(x: number, y: number, r: number) {
  G.beginPath();
  G.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  G.fill();
}

export function line(x1: number, y1: number, x2: number, y2: number) {
  G.beginPath();
  G.moveTo(x1, y1);
  G.lineTo(x2, y2);
  G.stroke();
}

export function rr(x: number, y: number, w: number, h: number, r: number) {
  G.beginPath();
  if (G.roundRect) G.roundRect(x, y, w, h, r);
  else G.rect(x, y, w, h);
  G.fill();
}
