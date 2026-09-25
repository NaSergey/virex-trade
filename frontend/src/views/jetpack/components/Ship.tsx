import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { FlameBoost, FlameGlow, FlamePlume, RocketDefs, RocketHalo, RocketHull } from '@/shared/ui/rocket';
import { SHIP_ORIGIN, SHIP_VIEW } from '../lib/flight';

const P = 'jpg';
const VIEW = `${SHIP_VIEW.x} ${SHIP_VIEW.y} ${SHIP_VIEW.w} ${SHIP_VIEW.h}`;
/** Срез сопла (y = 24 в системе ракеты) — вокруг него дрожит пламя. */
const NOZZLE_Y = ((24 - SHIP_VIEW.y) / SHIP_VIEW.h) * 100;
const ORIGIN = `${SHIP_ORIGIN.x * 100}% ${SHIP_ORIGIN.y * 100}%`;

/**
 * SVG слоя корабля. `fill="none"` — как у слоёв карточки (`Art`): пути
 * ореола и струек заливки не задают, и без него залились бы чёрным.
 */
function Art({ children }: { children: ReactNode }) {
  return (
    <svg viewBox={VIEW} fill="none" aria-hidden>
      {children}
    </svg>
  );
}

/** Определения ракеты — один раз на страницу, в невидимом SVG. */
export function ShipDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="jpg-defs">
      <defs>
        <RocketDefs prefix={P} />
      </defs>
    </svg>
  );
}

/**
 * Корабль — та же сборка, что у карточки витрины, слой в слой: ореол по
 * силуэту, свечение пламени, факел, форсаж и корпус (`shared/ui/rocket.tsx`).
 * Стабилизаторы — симметричные: ракета стоит на площадке прямо, и ракурс
 * снимка карточки (правый крупнее) читался здесь кривой ракетой.
 * Каждая часть — свой HTML-слой: сдвиг и наклон корабля (`FlightStage`,
 * каждым кадром — вокруг сопла), покачивание и дрожь пламени — `transform`
 * вложенных слоёв, и SVG внутри растрируется один раз (правило сцен витрины).
 * Покачивание — свой слой: в одном слое с наклоном они затёрли бы друг друга.
 */
export const Ship = forwardRef<HTMLDivElement, { w: number; h: number; hidden: boolean; flying: boolean }>(
  function Ship({ w, h, hidden, flying }, ref) {
    const style = {
      width: w,
      height: h,
      marginLeft: -w * SHIP_ORIGIN.x,
      marginTop: -h * SHIP_ORIGIN.y,
      transformOrigin: ORIGIN,
    } as CSSProperties;
    return (
      <div
        ref={ref}
        className="jpg-ship"
        data-hidden={hidden || undefined}
        data-flying={flying || undefined}
        style={style}
      >
        <div className="jpg-sway" style={{ transformOrigin: ORIGIN }}>
          <div className="jpg-halo">
            <Art>
              <RocketHalo prefix={P} symmetric />
            </Art>
          </div>
          {/* Длина факела — тяга (`--thrust`, её пишет кадр), дрожь — вложенный
              слой: в одном слое они затёрли бы друг друга (оба transform). */}
          <div className="jpg-flame" style={{ transformOrigin: `50% ${NOZZLE_Y}%` }}>
            <div className="jpg-flicker" style={{ transformOrigin: `50% ${NOZZLE_Y}%` }}>
              <div className="jpg-flame-glow">
                <Art>
                  <FlameGlow prefix={P} />
                </Art>
              </div>
              <Art>
                <FlamePlume prefix={P} />
              </Art>
            </div>
          </div>
          <div className="jpg-boost">
            <Art>
              <FlameBoost prefix={P} />
            </Art>
          </div>
          <Art>
            <RocketHull prefix={P} symmetric />
          </Art>
        </div>
      </div>
    );
  },
);
