/**
 * Кадр полёта чистыми функциями. Формула множителя — та же, что на сервере
 * (`backend/src/jetpack/jetpack.ts`), а темп (`rate`) приходит в виде, чтобы
 * второй копии константы не было.
 *
 * Полёт в две части. Взлёт: ракета стоит на площадке вертикально и по дуге
 * гравитационного разворота уходит вправо-вверх до своей точки в кадре — мир
 * при этом стоит, видно, как она отрывается от земли. Дальше камера ведёт её
 * по диагонали: ракета держится на месте, мир уходит вниз-влево.
 */

export const x100At = (ms: number, rate: number) => (ms <= 0 ? 100 : Math.floor(100 * Math.exp(rate * ms)));
export const msTo = (x100: number, rate: number) => Math.log(x100 / 100) / rate;
export const payout = (amount: number, x100: number) => Math.floor((amount * x100) / 100);
export const formatX = (x100: number) => `${(x100 / 100).toFixed(2)}x`;
/** Множитель без округления — для движения: ступеньки сотых дёргали бы мир. */
export const mAt = (ms: number, rate: number) => (ms <= 0 ? 1 : Math.exp(rate * ms));

/**
 * Тяга двигателя от времени полёта: до старта — 0 (огня нет), в момент
 * запуска — факел зажигания, дальше плавно (smoothstep) до полной за
 * `THRUST_MS`. Полный факел с форсажем прямо на отрыве от площадки читался
 * турбиной на максимуме у ракеты, которая только трогается (владелец).
 */
export const THRUST_MS = 3200;
const IGNITION = 0.18;
export function thrustAt(ms: number) {
  if (ms <= 0) return 0;
  const k = Math.min(1, ms / THRUST_MS);
  return IGNITION + (1 - IGNITION) * k * k * (3 - 2 * k);
}

/** Полоса истории: до 2x — тускло, до 10x — акцент, выше — ярко. */
export const historyTone = (x100: number) => (x100 < 200 ? 'low' : x100 < 1000 ? 'mid' : 'high');

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const RAD = Math.PI / 180;

/**
 * Рамка рисунка корабля в системе ракеты (`shared/ui/rocket.tsx`): x от −90 до
 * 90 — стабилизаторы с ореолом, y от −200 (над носом) до 290 (хвост форсажа).
 * Хвост ракеты — начало координат.
 */
export const SHIP_VIEW = { x: -90, y: -200, w: 180, h: 490 } as const;
export const SHIP_ORIGIN = { x: -SHIP_VIEW.x / SHIP_VIEW.w, y: -SHIP_VIEW.y / SHIP_VIEW.h } as const;
/** Длина корпуса в системе ракеты — от хвоста до острия носа. */
const HULL = 182;
/**
 * Низ стабилизаторов ниже среза корпуса — на столько ракета стоит над
 * площадкой. Симметричные стабилизаторы игры кончаются на y = 44.
 */
export const FIN_DROP = 44 / HULL;

/**
 * Корпус — пятая часть высоты поля, от 56 до 136 px; рамка — в том же
 * масштабе. От корпуса растёт весь стартовый комплекс. Четверть поля (до
 * 170 px) стояла, пока поле было окном в рамке; во весь экран ракета с
 * башней выходили крупными по отношению к человеку за экраном (владелец
 * 2026-09-25).
 */
export function shipSize(h: number) {
  const hull = clamp(h * 0.2, 56, 136);
  const s = hull / HULL;
  return { hull, w: SHIP_VIEW.w * s, h: SHIP_VIEW.h * s };
}

/**
 * Сопло на площадке (по высоте) и в своей точке кадра — доли поля от левого
 * верхнего угла. Площадка стоит на 72 % высоты, а не у самого низа: под ней
 * должен поместиться стартовый комплекс — основание, газоотвод, перрон.
 */
const PAD_Y = 0.72;
const CRUISE = { x: 0.7, y: 0.34 } as const;
/** Курс после разворота — от вертикали; по нему же камера ведёт мир. */
export const CRUISE_DEG = 62;
const TAN = Math.tan(CRUISE_DEG * RAD);

/**
 * Гравитационный разворот: наклон растёт от 0 на площадке до курса, быстрее в
 * начале (степень 0.5). От доли подъёма `p` до точки кадра.
 */
const headingAt = (p: number) => CRUISE_DEG * Math.sqrt(clamp(p, 0, 1));

/**
 * Снос вправо на единицу подъёма: ∫₀ᵖ tan(наклон) — ракета летит ровно туда,
 * куда смотрит нос. Кубическая кривая между площадкой и точкой кадра этого не
 * держала: на широком поле наклон по ней перелетал за курс до 72–76° и
 * возвращался — ракета качалась. Считается Симпсоном; 32 шага на кадр — пустяк.
 */
function drift(p: number) {
  if (p <= 0) return 0;
  const n = 32;
  const step = p / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const f = Math.tan(headingAt(i * step) * RAD);
    sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * f;
  }
  return (sum * step) / 3;
}
const DRIFT = drift(1);

/** Подъём на экране за взлёт — от площадки до точки кадра. */
const climbOf = (h: number) => (PAD_Y - CRUISE.y) * h;

/** Площадка: откуда ракета стартует. По x — так, чтобы дуга взлёта пришла в точку кадра. */
export const padAt = (w: number, h: number) => ({ x: CRUISE.x * w - climbOf(h) * DRIFT, y: PAD_Y * h });

/**
 * Высота полёта в пикселях поля: P·(√m − 1), P — 2.4 высоты поля. Скорость
 * подъёма ∝ √m: растёт вместе с множителем (к 10x втрое, к 100x в 10 раз), но
 * не взрывается, как сам множитель, — на 1000x мир не превращается в мельтешение.
 */
export const altOf = (m: number, h: number) => 2.4 * h * (Math.sqrt(Math.max(1, m)) - 1);

export interface Flight {
  /** Сопло ракеты на экране. */
  x: number;
  y: number;
  /** Наклон ракеты от вертикали. */
  deg: number;
  /** Насколько камера ушла вправо и вверх — на столько мир съезжает влево и вниз. */
  camX: number;
  camY: number;
  /** Закат у горизонта: 1 на земле, гаснет к 2.2x. */
  dusk: number;
  /** Космос: звёзды, туманность, планета — от 1.8x до 4x проявляются целиком. */
  space: number;
}

export function flightAt(m: number, w: number, h: number): Flight {
  const alt = altOf(m, h);
  const climb = climbOf(h);
  const p = Math.min(1, alt / climb);
  const pad = padAt(w, h);
  const camY = Math.max(0, alt - climb);
  return {
    x: pad.x + climb * drift(p),
    y: pad.y - p * climb,
    deg: headingAt(p),
    camX: camY * TAN,
    camY,
    dusk: clamp(1 - (m - 1) / 1.2, 0, 1),
    space: clamp((m - 1.8) / 2.2, 0, 1),
  };
}

/**
 * Земля — одна плоскость, а не стопка полос. Горизонт опускается медленно
 * (`K_HORIZON` от сдвига камеры), ближняя земля — перрон комплекса — вместе с
 * камерой, а пол между ними растягивается в перспективе. Предмет на земле
 * (хребет у горизонта, город, комплекс) едет ровно с той точкой пола, на
 * которой стоит: `t` — его глубина от горизонта (0) до перрона (1).
 *
 * Полосы с разным параллаксом без пола между ними стояли и сняты: пол уезжал
 * быстрее гор, под хребтом открывалось небо, город висел в воздухе.
 */
export const K_HORIZON = 0.35;
export const groundK = (t: number) => K_HORIZON + (1 - K_HORIZON) * clamp(t, 0, 1);

/** Сдвиг предмета, стоящего на земле на глубине `t`. */
export function groundShift(f: Pick<Flight, 'camX' | 'camY'>, t: number) {
  const k = groundK(t);
  return { x: -f.camX * k, y: f.camY * k };
}

/**
 * Преобразование пола (начало — горизонт, левый край): точка на глубине `y`
 * пикселей под горизонтом едет как предмет на глубине `y / depth`, где
 * `depth` — от горизонта до перрона. Сдвиг и наклон по x, растяжение по y.
 */
export function floorMatrix(f: Pick<Flight, 'camX' | 'camY'>, depth: number) {
  const k = 1 - K_HORIZON;
  const c = (-f.camX * k) / depth;
  const d = 1 + (f.camY * k) / depth;
  return `matrix(1, 0, ${c}, ${d}, ${-f.camX * K_HORIZON}, ${f.camY * K_HORIZON})`;
}

/** Метки высоты — множители (в сотых), которые проезжают мимо сопла. */
export const MARKS = [150, 200, 300, 500, 1000, 2000, 5000, 10_000, 25_000, 50_000, 100_000];

/** Место метки в мире — от верха поля, без сдвига камеры. */
export const markY = (x100: number, h: number) => PAD_Y * h - altOf(x100 / 100, h);

/** Сдвиг слоя по модулю плитки: слой узора не кончается. */
export const wrap = (v: number, tile: number) => ((v % tile) + tile) % tile;

/** Центр корпуса — там вспыхивает взрыв: от сопла вдоль оси на полкорпуса. */
export function hullCenter(x: number, y: number, hull: number, deg: number) {
  return { x: x + Math.sin(deg * RAD) * hull * 0.5, y: y - Math.cos(deg * RAD) * hull * 0.5 };
}

/**
 * Точка слоя с параллаксом `factor`, мимо которой ракета пройдёт на высоте
 * `alt`, — при камере на земле. Слой сдвигается на `cam × factor`, поэтому на
 * дальнем слое точка встречи ниже и ближе, на переднем — выше и дальше. Сюда
 * ставятся облака: иначе ракета летела бы мимо пустоты.
 */
export function passAt(alt: number, factor: number, w: number, h: number) {
  const climb = climbOf(h);
  const pad = padAt(w, h);
  if (alt <= climb) return { x: pad.x + climb * drift(alt / climb), y: pad.y - alt };
  const cam = alt - climb;
  return { x: CRUISE.x * w + factor * cam * TAN, y: CRUISE.y * h - factor * cam };
}
