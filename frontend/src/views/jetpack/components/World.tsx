'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef, type CSSProperties } from 'react';
import {
  FIN_DROP,
  floorMatrix,
  formatX,
  groundShift,
  K_HORIZON,
  MARKS,
  markY,
  padAt,
  passAt,
  wrap,
  type Flight,
} from '../lib/flight';
import { cloudField, hills, puddles } from '../lib/landscape';
import { LaunchSite, SITE_GROUND } from './LaunchSite';
import { Spaceport } from './Spaceport';

/** Мир отвечает на кадр одним вызовом: сдвиги и прозрачности слоёв. */
export interface WorldHandle {
  place(f: Flight): void;
}

/**
 * Параллакс неба: облака идут с камерой, передние — быстрее: они ближе
 * ракеты. Луна — с горизонтом: на взлёте садится за холмы. Почти неподвижная
 * (как настоящая) она стояла в кадре весь полёт и читалась летящей за ракетой
 * (владелец 2026-09-25). Земля едет не своим
 * множителем, а по глубине на плоскости (`groundShift`, `floorMatrix` в
 * lib/flight.ts): так холмы, космодром и площадка не отрываются от земли.
 */
const K = { clouds: 1, front: 1.3, moon: K_HORIZON } as const;
/** Космодром стоит за площадкой — на середине глубины от горизонта до плиты. */
const PORT_T = 0.55;

/** Слои звёзд — узор со сдвигом по модулю плитки; у каждого слоя своя плитка. */
const STARS = [
  { cls: 'far', k: 0.15, tile: 240 },
  { cls: 'mid', k: 0.5, tile: 300 },
  { cls: 'near', k: 1.3, tile: 360 },
] as const;

/**
 * Забор — в единицах ракеты (корпус — 182): `ahead` — насколько основание
 * ближе к зрителю, чем плита, `height` — столбики, `curb` — бортик под ними.
 */
const FENCE = { ahead: 10, height: 20, curb: 6 } as const;

/** Клубы стартового дыма: разлетаются от площадки в стороны. */
const PUFFS = [-3, -2, -1, 0, 1, 2, 3, -1.5, 1.5];

const move = (el: HTMLElement | null, f: Flight, k: number) => {
  if (el) el.style.transform = `translate(${-f.camX * k}px, ${f.camY * k}px)`;
};
const onGround = (el: HTMLElement | null, f: Flight, t: number) => {
  if (!el) return;
  const g = groundShift(f, t);
  el.style.transform = `translate(${g.x}px, ${g.y}px)`;
};
const fade = (el: HTMLElement | null, v: number) => {
  if (el) el.style.opacity = String(v);
};

/**
 * Геометрия сцены при камере на земле — от размера поля и корабля. До первого
 * замера поля (w = h = 0) сцены нет: пейзаж с нулевой шириной не строится —
 * у холмов не набирается ни одной вершины, а при нулевой ширине и живой
 * высоте шаг вершин равен нулю, и цикл не кончается.
 */
function useScene(w: number, h: number, hull: number) {
  return useMemo(() => {
    if (!w || !h) return null;
    const pad = padAt(w, h);
    const padTop = pad.y + hull * FIN_DROP;
    const horizon = padTop - 0.06 * h;
    const ext = w + 3 * h;
    const hillBand = 0.16 * h;
    const floorDepth = 1.2 * h;
    // Глубина земли — от горизонта до низа плиты: на ней земля едет с камерой.
    const groundDepth = padTop + (SITE_GROUND * hull) / 182 - horizon;
    // Мера размеров облаков и луж — ширина кадра, но не шире 1.15 его
    // высоты: во весь экран от чистой ширины они выходили в полтора раза
    // крупнее, чем в окне. Разброс по x по-прежнему от ширины.
    const u = Math.min(w, 1.15 * h);
    return {
      pad,
      padTop,
      horizon,
      ext,
      hillBand,
      floorDepth,
      groundDepth,
      hills: hills(ext, hillBand, 5, [0.18 * w, 0.36 * w], [0.25, 0.85]),
      // Лужицы — перед забором, от его бортика до края поля, по ширине кадра.
      fenceFoot: ((FENCE.ahead + FENCE.curb) * hull) / 182,
      water: puddles(w * 1.3, h - padTop, 14, 9, [0.028 * u, 0.068 * u]),
      back: cloudField(10, 21, [0.3 * h, 2.1 * h], (a) => passAt(a, K.clouds, w, h), {
        dx: [-0.55 * w, 0.3 * w],
        dy: [-0.1 * h, 0.1 * h],
        w: [0.18 * u, 0.4 * u],
      }),
      front: cloudField(4, 42, [0.7 * h, 1.9 * h], (a) => passAt(a, K.front, w, h), {
        dx: [-0.3 * w, 0.15 * w],
        dy: [-0.06 * h, 0.06 * h],
        w: [0.32 * u, 0.52 * u],
      }),
    };
  }, [w, h, hull]);
}

type Props = { w: number; h: number; hull: number; launched: string | null };

/**
 * Мир полёта позади ракеты — от земли до космоса, плоским неоном, как на
 * референсе владельца. Земля: ночное небо с луной и звёздами, пологие холмы
 * в сиреневой дымке, космодром (ангар, корпус управления с радаром),
 * площадка с радиомачтами и светящаяся вода на переднем плане. Выше —
 * облака, дальше небо темнеет до космоса с туманностью. Всё — HTML-слои:
 * кадр двигает их `transform` и гасит `opacity`, SVG внутри растрируется
 * один раз.
 */
export const World = forwardRef<WorldHandle, Props>(function World({ w, h, hull, launched }, ref) {
  const high = useRef<HTMLDivElement>(null);
  const night = useRef<HTMLDivElement>(null);
  const nebula = useRef<HTMLDivElement>(null);
  const starfield = useRef<HTMLDivElement>(null);
  const s0 = useRef<HTMLDivElement>(null);
  const s1 = useRef<HTMLDivElement>(null);
  const s2 = useRef<HTMLDivElement>(null);
  const moon = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const floorEl = useRef<SVGSVGElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const port = useRef<HTMLDivElement>(null);
  const clouds = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const scene = useScene(w, h, hull);
  const starRefs = [s0, s1, s2];

  useImperativeHandle(ref, () => ({
    place(f: Flight) {
      fade(night.current, f.dusk);
      fade(high.current, 1 - f.space);
      fade(nebula.current, f.space);
      // Ночью звёзды видны и с земли; в космосе — все.
      fade(starfield.current, 0.7 + 0.3 * f.space);
      STARS.forEach((s, i) => {
        const el = starRefs[i].current;
        if (el) el.style.transform = `translate(${-wrap(f.camX * s.k, s.tile)}px, ${wrap(f.camY * s.k, s.tile)}px)`;
      });
      move(moon.current, f, K.moon);
      onGround(far.current, f, 0);
      if (floorEl.current && scene) floorEl.current.style.transform = floorMatrix(f, scene.groundDepth);
      onGround(front.current, f, 1);
      onGround(port.current, f, PORT_T);
      move(clouds.current, f, K.clouds);
      onGround(near.current, f, 1);
      if (marks.current) marks.current.style.transform = `translateY(${f.camY}px)`;
    },
  }));

  if (!scene) return null;
  const { pad, padTop, horizon, ext, hillBand, floorDepth, groundDepth } = scene;
  const portBase = horizon + PORT_T * groundDepth;

  return (
    <>
      <div ref={high} className="jpg-sky high" aria-hidden />
      <div ref={night} className="jpg-sky night" aria-hidden />
      <div ref={nebula} className="jpg-nebula" aria-hidden />
      <div ref={starfield} className="jpg-starfield" aria-hidden>
        {STARS.map((s, i) => (
          <div
            key={s.cls}
            ref={starRefs[i]}
            className={`jpg-stars ${s.cls}`}
            style={{
              top: -s.tile,
              height: `calc(100% + ${s.tile}px)`,
              width: `calc(100% + ${s.tile}px)`,
              backgroundSize: `${s.tile}px ${s.tile}px`,
            }}
          />
        ))}
      </div>
      <div ref={moon} className="jpg-layer" aria-hidden>
        <i className="jpg-moon" style={{ left: 0.84 * w, top: 0.2 * h, width: 0.18 * h, height: 0.18 * h }} />
      </div>

      {/* Пологие холмы за горизонтом в сиреневой дымке. */}
      <div ref={far} className="jpg-layer" aria-hidden>
        <i className="jpg-haze" style={{ left: pad.x - 0.45 * w, top: horizon, width: 0.9 * w, height: 0.5 * h }} />
        <i className="jpg-haze pink" style={{ left: pad.x + 0.35 * w, top: horizon, width: 0.8 * w, height: 0.45 * h }} />
        <svg
          className="jpg-art"
          width={ext}
          height={hillBand}
          viewBox={`0 0 ${ext} ${hillBand}`}
          style={{ top: horizon - hillBand }}
        >
          <defs>
            <linearGradient id="jpg-hills" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a1a82" />
              <stop offset="1" stopColor="#1e0c4c" />
            </linearGradient>
          </defs>
          <path d={scene.hills} fill="url(#jpg-hills)" stroke="#a070ff" strokeOpacity="0.55" strokeWidth="1.4" />
        </svg>
      </div>

      {/* Земля делится по линии площадки. Задняя часть — от горизонта до
          площадки — растягивается в перспективе (`floorMatrix`): на ней стоят
          холмы у горизонта и космодром. Передняя — от площадки к зрителю, с
          лужицами, — едет вместе с площадкой. Одним полем до низа кадра она
          растягивалась бы по той же формуле: ниже площадки глубина в разы
          больше глубины самой площадки, передний план ехал в 10–13 раз быстрее
          камеры, перекашивался и открывал небо справа («расслаивается»). На
          линии раздела обе части сдвигаются одинаково — шва нет. */}
      <div className="jpg-layer" aria-hidden>
        <svg
          ref={floorEl}
          className="jpg-art"
          width={ext}
          height={groundDepth}
          viewBox={`0 0 ${ext} ${groundDepth}`}
          preserveAspectRatio="none"
          style={{ top: horizon, transformOrigin: '0 0' }}
        >
          <defs>
            <linearGradient id="jpg-ground-back" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1a1046" />
              <stop offset="1" stopColor="#140d3a" />
            </linearGradient>
          </defs>
          <rect width={ext} height={groundDepth} fill="url(#jpg-ground-back)" />
          <line x1="0" y1="0.5" x2={ext} y2="0.5" stroke="#8a5cff" strokeOpacity="0.5" strokeWidth="1" />
        </svg>
      </div>
      <div ref={front} className="jpg-layer" aria-hidden>
        <svg
          className="jpg-art"
          width={ext}
          height={floorDepth}
          viewBox={`0 0 ${ext} ${floorDepth}`}
          style={{ top: horizon + groundDepth }}
        >
          <defs>
            <linearGradient id="jpg-ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#140d3a" />
              <stop offset="0.3" stopColor="#0f0a2e" />
              <stop offset="1" stopColor="#06041a" />
            </linearGradient>
            <linearGradient id="jpg-water" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7af2ff" />
              <stop offset="0.5" stopColor="#35d8ee" />
              <stop offset="1" stopColor="#1fa6d6" />
            </linearGradient>
          </defs>
          <rect width={ext} height={floorDepth} fill="url(#jpg-ground)" />
          <g transform={`translate(0 ${scene.fenceFoot + 4})`}>
            {scene.water.map((p) => (
              <g key={p.d}>
                <path d={p.d} fill="url(#jpg-water)" opacity="0.9" />
                <path d={p.shine} fill="#c8fcff" opacity="0.45" />
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div ref={port} className="jpg-layer" aria-hidden>
        <Spaceport x={pad.x} base={portBase} hull={hull} />
      </div>

      <div ref={clouds} className="jpg-layer" aria-hidden>
        {scene.back.map((c) => (
          <i key={`${c.x}-${c.y}`} className={`jpg-cloud ${c.tone}`} style={{ left: c.x, top: c.y, width: c.w }} />
        ))}
      </div>

      {/* Площадка и дым — стоят на плите, едут с камерой. */}
      <div ref={near} className="jpg-layer" aria-hidden>
        <LaunchSite x={pad.x} top={padTop} hull={hull} launched={launched} />
        {launched ? (
          <div key={launched} className="jpg-smoke" style={{ left: pad.x, top: padTop + hull * 0.1 }}>
            {PUFFS.map((p, i) => (
              <i key={i} style={{ '--dx': p, '--i': i } as CSSProperties} />
            ))}
          </div>
        ) : (
          <div className="jpg-steam" style={{ left: pad.x, top: padTop + hull * 0.04 }}>
            <i />
            <i />
          </div>
        )}
      </div>

      <div ref={marks} className="jpg-layer marks" aria-hidden>
        {MARKS.map((x) => (
          <div key={x} className="jpg-mark" style={{ top: markY(x, h) }}>
            <span className="n">{formatX(x)}</span>
          </div>
        ))}
      </div>
    </>
  );
});

/**
 * Забор перед площадкой, как на референсе космодрома: столбики с перилами на
 * всю ширину. Столбики — узором (`pattern`), а не сотней узлов. `ground` —
 * линия основания столбиков, под ней бортик.
 */
function Fence({ width, ground, hull }: { width: number; ground: number; hull: number }) {
  const u = hull / 182;
  const hgt = FENCE.height * u;
  const step = 16 * u;
  return (
    <svg className="jpg-art" width={width} height={hgt + FENCE.curb * u} viewBox={`0 0 ${width} ${hgt + FENCE.curb * u}`} style={{ top: ground - hgt }}>
      <defs>
        <pattern id="jpg-fence" width={step} height={hgt} patternUnits="userSpaceOnUse">
          <rect x="0" y={2 * u} width={3 * u} height={hgt - 2 * u} fill="#3a5ad8" />
          <rect x={-0.5 * u} y="0" width={4 * u} height={2.4 * u} fill="#8fd6ff" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={width} height={hgt} fill="url(#jpg-fence)" />
      <rect x="0" y={3 * u} width={width} height={2.2 * u} fill="#6ec2ff" />
      <rect x="0" y={11 * u} width={width} height={1.6 * u} fill="#4a86e6" />
      <rect x="0" y={hgt} width={width} height={FENCE.curb * u} fill="#120c34" />
    </svg>
  );
}

/**
 * Передний план над ракетой — забор. Он ближе к зрителю, чем плита, и на
 * земле закрывает низ стабилизаторов; в слое площадки под кораблём он
 * читался стоящим позади ракеты (владелец 2026-09-26). Едет вместе с плитой.
 */
export const Foreground = forwardRef<WorldHandle, { w: number; h: number; hull: number }>(function Foreground(
  { w, h, hull },
  ref,
) {
  const layer = useRef<HTMLDivElement>(null);
  const scene = useScene(w, h, hull);
  useImperativeHandle(ref, () => ({
    place(f: Flight) {
      onGround(layer.current, f, 1);
    },
  }));
  if (!scene) return null;
  return (
    <div ref={layer} className="jpg-layer" aria-hidden>
      <Fence width={scene.ext} ground={scene.padTop + (FENCE.ahead * hull) / 182} hull={hull} />
    </div>
  );
});

/** Передние облака — над ракетой: она пролетает сквозь них, а не за ними. */
export const FrontClouds = forwardRef<WorldHandle, { w: number; h: number; hull: number }>(function FrontClouds(
  { w, h, hull },
  ref,
) {
  const layer = useRef<HTMLDivElement>(null);
  const scene = useScene(w, h, hull);
  useImperativeHandle(ref, () => ({
    place(f: Flight) {
      move(layer.current, f, K.front);
      fade(layer.current, Math.max(0, 1 - f.space * 1.5));
    },
  }));
  if (!scene) return null;
  return (
    <div ref={layer} className="jpg-layer" aria-hidden>
      {scene.front.map((c) => (
        <i key={`${c.x}-${c.y}`} className="jpg-cloud front" style={{ left: c.x, top: c.y, width: c.w }} />
      ))}
    </div>
  );
});
