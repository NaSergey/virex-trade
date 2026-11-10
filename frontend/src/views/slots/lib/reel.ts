import type { SlotSymbol } from '@/entities/slots';
import { symHref } from '@/shared/ui/SlotSymbols';

/**
 * Барабан — пул из пяти клеток и положение ленты `pos` (в клетках). Клетка с
 * номером `j` стоит на строке `pos − j` (0 — верх окна), поэтому рост `pos`
 * везёт ленту вниз, как у настоящего автомата. Символ номера `j` выбирается
 * один раз и помнится, пока номер может быть на экране: клетка не меняет
 * символ на глазах.
 *
 * Кадр пишется в DOM напрямую (`transform` клеток), а не состоянием React:
 * пять барабанов по 60 кадров в секунду перерисовывали бы весь автомат.
 *
 * Остановка: результат кладётся на номера, которые ещё не выезжали в окно
 * (`S`, `S−1`, `S−2` при `S ≥ ⌊pos⌋ + 4`), и лента тормозит ровно на `S` —
 * с проездом чуть дальше и отскоком назад, как лента на упоре.
 */

const POOL = 5;
/** Взвод: лента сначала чуть поднимается — рывок рычага. */
const WINDUP_MS = 150;
const WINDUP = 0.28;
const ACCEL_MS = 260;
/** Проезд за цель и отскок на упоре. */
const OVERSHOOT = 0.22;
const SETTLE_MS = 260;

type Phase = 'idle' | 'windup' | 'accel' | 'cruise' | 'stopping' | 'settle';

interface Cell {
  el: HTMLElement;
  use: SVGUseElement;
  j: number;
  href: string;
}

export class Reel {
  pos = 2;
  private phase: Phase = 'idle';
  private t0 = 0;
  private p0 = 0;
  private vmax = 24;
  private vel = 0;
  private target = 0;
  private stopAt = Infinity;
  private pending: SlotSymbol[] | null = null;
  private stopDur = 0;
  private readonly syms = new Map<number, SlotSymbol>();
  private readonly cells: Cell[];
  /** Сработал на упоре — барабан встал (до отскока). */
  onLand: (() => void) | null = null;

  constructor(
    els: HTMLElement[],
    private readonly filler: () => SlotSymbol,
    column: SlotSymbol[],
  ) {
    this.cells = els.slice(0, POOL).map((el) => ({ el, use: el.querySelector('use')!, j: NaN, href: '' }));
    this.syms.set(2, column[0]);
    this.syms.set(1, column[1]);
    this.syms.set(0, column[2]);
    this.target = 2;
    this.render();
  }

  get spinning() {
    return this.phase !== 'idle';
  }

  /** Номер клетки на строке `row` после остановки. */
  cellAt(row: number): HTMLElement | null {
    const j = this.target - row;
    return this.cells.find((c) => c.j === j)?.el ?? null;
  }

  start(now: number, speed: number) {
    this.phase = 'windup';
    this.t0 = now;
    this.p0 = this.pos;
    this.vmax = speed;
    this.vel = 0;
    this.stopAt = Infinity;
    this.pending = null;
  }

  /** Встать на `column` не раньше `at` (часы `performance.now`). */
  stop(column: SlotSymbol[], at: number) {
    this.pending = column;
    this.stopAt = at;
  }

  /** Сразу на тормоз: второе нажатие «Спин» — как удар по кнопке стопа. */
  hurry(now: number) {
    if (this.pending) this.stopAt = Math.min(this.stopAt, now);
  }

  /** Шаг кадра. Возвращает, движется ли барабан. */
  tick(now: number, dt: number): boolean {
    if (this.phase === 'idle') return false;
    const t = now - this.t0;
    switch (this.phase) {
      case 'windup': {
        const u = Math.min(1, t / WINDUP_MS);
        this.pos = this.p0 - WINDUP * Math.sin(Math.PI * u);
        if (u >= 1) this.enter('accel', now);
        break;
      }
      case 'accel': {
        const u = Math.min(1, t / ACCEL_MS);
        this.vel = this.vmax * u * u;
        this.pos += (this.vel * dt) / 1000;
        if (u >= 1) this.enter('cruise', now);
        break;
      }
      case 'cruise':
        this.vel = this.vmax;
        this.pos += (this.vel * dt) / 1000;
        if (this.pending && now >= this.stopAt) this.beginStop(now);
        break;
      case 'stopping': {
        // Кубическое торможение: начальная скорость равна крейсерской, шва нет.
        const u = Math.min(1, t / this.stopDur);
        const end = this.target + OVERSHOOT;
        this.pos = this.p0 + (end - this.p0) * (1 - (1 - u) ** 3);
        this.vel = this.vmax * (1 - u) ** 2;
        if (u >= 1) {
          this.enter('settle', now);
          this.onLand?.();
        }
        break;
      }
      case 'settle': {
        const u = Math.min(1, t / SETTLE_MS);
        this.pos = this.target + OVERSHOOT * Math.exp(-5 * u) * Math.cos(u * Math.PI * 2.5);
        if (u >= 1) {
          this.pos = this.target;
          this.phase = 'idle';
          this.vel = 0;
        }
        break;
      }
    }
    this.render();
    return this.phase !== 'idle';
  }

  private enter(phase: Phase, now: number) {
    this.phase = phase;
    this.t0 = now;
    this.p0 = this.pos;
  }

  private beginStop(now: number) {
    const column = this.pending!;
    const base = Math.floor(this.pos);
    // Тормозной путь — около трети секунды на крейсерской скорости.
    const s = Math.max(base + 4, Math.ceil(this.pos + (this.vmax * 0.36) / 3));
    this.target = s;
    this.syms.set(s, column[0]);
    this.syms.set(s - 1, column[1]);
    this.syms.set(s - 2, column[2]);
    this.enter('stopping', now);
    this.stopDur = (3 * (s + OVERSHOOT - this.pos) * 1000) / this.vmax;
    this.pending = null;
    for (const k of this.syms.keys()) if (k < base - 6) this.syms.delete(k);
  }

  private symOf(j: number): SlotSymbol {
    let s = this.syms.get(j);
    if (!s) {
      s = this.filler();
      this.syms.set(j, s);
    }
    return s;
  }

  private render() {
    const base = Math.floor(this.pos);
    const blur = this.vel > this.vmax * 0.55;
    for (let j = base - 2; j <= base + 2; j++) {
      const cell = this.cells[((j % POOL) + POOL) % POOL];
      const y = this.pos - j;
      if (cell.j !== j) cell.j = j;
      const href = symHref(this.symOf(j), blur);
      if (cell.href !== href) {
        cell.href = href;
        cell.use.setAttribute('href', href);
      }
      cell.el.style.transform = `translate3d(0, ${(y * 100).toFixed(3)}%, 0)`;
    }
  }
}
