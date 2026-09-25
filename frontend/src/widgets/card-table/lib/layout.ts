/**
 * Раскладка мест по овалу стола.
 *
 * Крупье — такое же место за столом, как игроки: во главе, сверху. Все места
 * вместе с его местом стоят на равном расстоянии друг от друга ПО ДЛИНЕ
 * овала, а не по углу: на вытянутом овале равный угол сбивает места к бокам и
 * растягивает верх и низ. Своё место — ближайшее к низу: ровно внизу, когда
 * мест вместе с крупье чётное число, иначе на полшага левее, и тогда внизу
 * стоят два места симметрично — как за любым столом с крупье во главе.
 *
 * Здесь уже стояли два неверных варианта: равномерный круг без крупье ставил
 * место напротив меня ровно на колоду, а «я и крупье — полюса, остальные по
 * сторонам» при чётном числе мест делил стороны неровно (3 слева, 2 справа).
 *
 * Места идут по часовой стрелке; координаты — проценты от сцены.
 */
export interface SeatPoint {
  x: number;
  y: number;
}

/** Пропорция сцены: широкая на компьютере, вытянутая вверх на телефоне (globals.css). */
export const STAGE_WIDE = 2;
export const STAGE_TALL = 3 / 4;

/**
 * Ряд мест — эллипс вокруг сукна: по горизонтали — полуось сукна (35% сцены,
 * см. `.ct-felt`) плюс одинаковый в пикселях отступ, иначе на широкой сцене
 * места по бокам уезжали бы от стола.
 *
 * По вертикали ряд уже, чем сукно (39% против 44%): сукно вытянуто почти во
 * всю высоту сцены, а места сверху и снизу садятся на бортик, а не за него.
 * Отодвинь их вслед за сукном — нижнее место, своё, ушло бы под панель хода,
 * а сцена с полями под места по 11% сверху и снизу держала стол низким.
 */
const FELT_RX = 35;
const SEAT_RY = 39;
const RIM = 2; // % ширины сцены

function ring(aspect: number) {
  return { rx: FELT_RX + RIM, ry: SEAT_RY + RIM * aspect };
}

const SAMPLES = 720;
const arcCache = new Map<number, { t: number[]; s: number[] }>();

/** Длина дуги ряда от верха по часовой стрелке — в пикселях сцены, а не в процентах. */
function arcTable(aspect: number) {
  let table = arcCache.get(aspect);
  if (table) return table;
  const { rx, ry } = ring(aspect);
  const a = (rx / 100) * aspect;
  const b = ry / 100;
  const t: number[] = [];
  const s: number[] = [];
  let acc = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const ti = -Math.PI / 2 + (i / SAMPLES) * 2 * Math.PI;
    if (i > 0) {
      const tp = t[i - 1];
      acc += Math.hypot(a * (Math.cos(ti) - Math.cos(tp)), b * (Math.sin(ti) - Math.sin(tp)));
    }
    t.push(ti);
    s.push(acc);
  }
  table = { t, s };
  arcCache.set(aspect, table);
  return table;
}

/** Точка ряда на доле `f` длины овала от верха по часовой стрелке. */
function pointAt(f: number, aspect: number): SeatPoint {
  const { t, s } = arcTable(aspect);
  const target = f * s[SAMPLES];
  let i = 1;
  while (i < SAMPLES && s[i] < target) i++;
  const k = s[i] === s[i - 1] ? 0 : (target - s[i - 1]) / (s[i] - s[i - 1]);
  const angle = t[i - 1] + (t[i] - t[i - 1]) * k;
  const { rx, ry } = ring(aspect);
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}

/**
 * Номер места на овале (0 — крупье сверху, дальше по часовой) для места
 * игрока. Своё — ближайшее к низу.
 */
export function slotOf(seatIndex: number, maxSeats: number, mySeat: number | null): number {
  const slots = maxSeats + 1;
  const mine = Math.ceil(slots / 2);
  const k = (seatIndex - (mySeat ?? 0) + maxSeats) % maxSeats;
  return ((mine - 1 + k) % maxSeats) + 1;
}

export function seatPoint(seatIndex: number, maxSeats: number, mySeat: number | null, aspect = STAGE_WIDE): SeatPoint {
  return pointAt(slotOf(seatIndex, maxSeats, mySeat) / (maxSeats + 1), aspect);
}

/** Где стоит ставка места: на пути от места к центру стола. */
export function betPoint(p: SeatPoint, share = 0.4): SeatPoint {
  return { x: p.x + (50 - p.x) * share, y: p.y + (50 - p.y) * share };
}

/** Инициалы для кружка места: аватаров в продукте нет. */
export function initials(name: string | null, fallback: string): string {
  const src = (name ?? '').trim() || fallback;
  const parts = src.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}
