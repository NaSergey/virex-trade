import { useMemo, type CSSProperties } from 'react';
import { windowStrips } from '../lib/landscape';

/**
 * Космодром за площадкой, как на референсе владельца: слева арочный ангар с
 * откатными воротами и пристройкой, справа корпус управления — этажи в лентах
 * остекления с неоновыми окнами, застеклённый пост на крыше с радаром,
 * боковой блок с лестничной клеткой и решётчатая антенна на растяжках.
 * Единицы — ракеты (корпус — 182), чтобы здания стояли в одном масштабе с
 * площадкой; начало — под серединой плиты, y = 0 — земля здания.
 *
 * Мелочь фасадов (швы обшивки, импосты, подоконники) — толщиной в единицу:
 * при корпусе 56–136 px единица — от трети до трёх четвертей пикселя, и это
 * фактура стены, а не отдельные предметы. Новых построек рядом нет — владелец
 * уже снимал сцену за «слишком много элементов»; детали живут внутри силуэтов.
 *
 * Голова радара — свой HTML-слой (`Radar`): она ходит, а SVG — нет.
 */

const VB = { x: -700, y: -240, w: 1480, h: 240 } as const;
const STRIP_TONES = ['#ff5fa0', '#5ae0ff', '#b89cff'];
/** Ось поворота головы радара — над постом на крыше корпуса управления. */
const DISH = { x: 500, y: -176 } as const;

const id = (name: string) => `jpg-sp-${name}`;
const url = (name: string) => `url(#${id(name)})`;

function Defs() {
  return (
    <defs>
      <linearGradient id={id('hangar')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3553d8" />
        <stop offset="1" stopColor="#1b2a86" />
      </linearGradient>
      <linearGradient id={id('main')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2c3a9e" />
        <stop offset="1" stopColor="#1a2066" />
      </linearGradient>
      <linearGradient id={id('side')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4264e6" />
        <stop offset="1" stopColor="#253aa8" />
      </linearGradient>
      <linearGradient id={id('glass')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2f6ae0" />
        <stop offset="1" stopColor="#10266e" />
      </linearGradient>
    </defs>
  );
}

/** Ангар: фронтон — арка над стенами, `rise` — её подъём над карнизом. */
const HANGAR = { x0: -640, x1: -380, eave: -44, rise: 18 } as const;
const DOOR = { x0: -604, x1: -484, top: -35, panels: 8 } as const;
/** Высота арки над точкой `x` — та же квадратичная кривая, что у фронтона. */
const roofY = (x: number) => {
  const t = (x - HANGAR.x0) / (HANGAR.x1 - HANGAR.x0);
  return HANGAR.eave - 4 * HANGAR.rise * t * (1 - t);
};

function Hangar() {
  const { x0, x1, eave, rise } = HANGAR;
  const mid = (x0 + x1) / 2;
  const peak = eave - 2 * rise;
  const gap = (DOOR.x0 + DOOR.x1) / 2;
  const pw = (DOOR.x1 - DOOR.x0) / DOOR.panels;
  const seams = Array.from({ length: 13 }, (_, i) => x0 + 16 + 20 * i).filter((sx) => sx > DOOR.x1 + 4 && sx < x1 - 8);
  return (
    <g>
      <path d={`M${x0} 0 V${eave} Q${mid} ${peak} ${x1} ${eave} V0 Z`} fill={url('hangar')} />
      {/* Швы обшивки — вертикально по стене пристройки. */}
      <g stroke="#2a44b8" strokeWidth="1" strokeOpacity="0.8">
        {seams.map((sx) => (
          <line key={sx} x1={sx} y1={roofY(sx) + 4} x2={sx} y2="-3" />
        ))}
      </g>
      {/* Кромка арки: неон снаружи, под ним — тёмный край кровли. */}
      <path d={`M${x0 + 6} ${eave} Q${mid} ${peak + 6} ${x1 - 6} ${eave}`} fill="none" stroke="#5f86ff" strokeOpacity="0.6" />
      <path d={`M${x0} ${eave} Q${mid} ${peak} ${x1} ${eave}`} fill="none" stroke="#8fe6ff" strokeWidth="1.6" />
      <rect x={x0 + 6} y="-43" width={x1 - x0 - 12} height="2" fill="#8fe6ff" opacity="0.75" />
      {/* Табличка над воротами. */}
      <rect x={gap - 22} y="-53" width="44" height="9" fill="#ff7ac0" opacity="0.9" />
      {[-16, -6, 4].map((dx) => (
        <rect key={dx} x={gap + dx} y="-51" width="7" height="5" fill="#4a1450" />
      ))}

      {/* Откатные ворота: рельс сверху, створки с рёбрами, между половинами —
          щель, из неё свет изнутри. По углам — жёлтые проблесковые огни. */}
      <rect x={DOOR.x0 - 3} y={DOOR.top - 3} width={DOOR.x1 - DOOR.x0 + 6} height={-DOOR.top + 3} fill="#0e1446" />
      <rect x={DOOR.x0} y={DOOR.top} width={DOOR.x1 - DOOR.x0} height={-DOOR.top} fill="#1c2a88" />
      <g stroke="#0f1650" strokeWidth="1.4">
        {Array.from({ length: DOOR.panels - 1 }, (_, i) => (
          <line key={i} x1={DOOR.x0 + (i + 1) * pw} y1={DOOR.top} x2={DOOR.x0 + (i + 1) * pw} y2="0" />
        ))}
      </g>
      <g stroke="#34489e" strokeWidth="1">
        <line x1={DOOR.x0} y1={DOOR.top + 12} x2={DOOR.x1} y2={DOOR.top + 12} />
        <line x1={DOOR.x0} y1={DOOR.top + 24} x2={DOOR.x1} y2={DOOR.top + 24} />
      </g>
      <rect x={gap - 3} y={DOOR.top} width="6" height={-DOOR.top} fill="#ffe2a0" />
      <rect x={gap - 1} y={DOOR.top} width="2" height={-DOOR.top} fill="#fff6dc" />
      <rect x={DOOR.x0 - 6} y={DOOR.top - 5} width={DOOR.x1 - DOOR.x0 + 12} height="2" fill="#6f8cff" />
      <rect x={DOOR.x0 - 9} y={DOOR.top - 1} width="4" height="3" fill="#ffb347" />
      <rect x={DOOR.x1 + 5} y={DOOR.top - 1} width="4" height="3" fill="#ffb347" />

      {/* Пристройка справа от ворот: два ряда окон и дверь с козырьком. */}
      {[-30, -21].map((wy, row) =>
        Array.from({ length: 6 }, (_, k) => {
          if (row === 1 && k === 2) return null;
          const wx = -472 + 14 * k;
          return (
            <g key={`${row}-${k}`}>
              <rect x={wx} y={wy} width="10" height="7" fill="#0e1446" />
              <rect x={wx + 1} y={wy + 1} width="8" height="5" fill="#8fe6ff" opacity={(k + row) % 4 === 1 ? 0.25 : 0.8} />
            </g>
          );
        }),
      )}
      <rect x="-446" y="-12" width="10" height="12" fill="#0e1446" />
      <rect x="-444" y="-10" width="6" height="3" fill="#8fe6ff" opacity="0.7" />
      <rect x="-448" y="-14" width="14" height="1.5" fill="#6f8cff" />
      <rect x="-443" y="-16" width="4" height="1.5" fill="#ffe2a0" />

      {/* Лестница на кровлю у левого угла. */}
      <g stroke="#7f95e8" strokeWidth="1">
        <line x1="-628" y1="-2" x2="-628" y2={roofY(-628) - 3} />
        <line x1="-622" y1="-2" x2="-622" y2={roofY(-622) - 3} />
        {Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1="-628" y1={-5 - 4 * i} x2="-622" y2={-5 - 4 * i} />
        ))}
      </g>

      {/* Антенны на арке — основание на кривой кровли. */}
      {[-612, -566, -508].map((ax) => {
        const b = roofY(ax);
        return (
          <g key={ax} stroke="#9fb4ff" strokeWidth="1.6">
            <line x1={ax} y1={b} x2={ax} y2={b - 22} />
            <line x1={ax - 6} y1={b - 22} x2={ax + 6} y2={b - 22} />
            <line x1={ax - 3} y1={b - 16} x2={ax + 3} y2={b - 16} />
          </g>
        );
      })}
      <rect x={x0 - 6} y="-3" width={x1 - x0 + 12} height="3" fill="#141a4a" />
    </g>
  );
}

/** Тонкая белая решётчатая антенна на растяжках, у подножия — будка. */
function Antenna({ x }: { x: number }) {
  const top = -200;
  const n = 10;
  return (
    <g>
      <g stroke="#c8d4ff" strokeWidth="0.8" strokeOpacity="0.35">
        <line x1={x} y1={top * 0.72} x2={x - 44} y2="0" />
        <line x1={x} y1={top * 0.72} x2={x + 42} y2="0" />
        <line x1={x} y1={top * 0.4} x2={x - 30} y2="0" />
      </g>
      <g stroke="#c8d4ff" strokeWidth="1.3" fill="none" strokeOpacity="0.85">
        <path d={`M${x - 9} 0 L${x - 2} ${top} M${x + 9} 0 L${x + 2} ${top}`} strokeWidth="1.8" />
        {Array.from({ length: n }, (_, i) => {
          const y0 = (top * i) / n;
          const y1 = (top * (i + 1)) / n;
          const h0 = 9 - (7 * i) / n;
          const h1 = 9 - (7 * (i + 1)) / n;
          return <path key={i} d={`M${x - h0} ${y0} L${x + h1} ${y1} M${x + h0} ${y0} L${x - h1} ${y1}`} />;
        })}
        <line x1={x} y1={top} x2={x} y2={top - 22} />
      </g>
      <circle cx={x} cy={top - 23} r="2.2" fill="#ff3355" />
      <rect x={x - 14} y="-10" width="28" height="10" fill="#1d2a78" stroke="#6d7cff" strokeWidth="0.6" />
      <rect x={x - 9} y="-7" width="6" height="3" fill="#8fe6ff" opacity="0.6" />
    </g>
  );
}

const MAIN = { x0: 380, x1: 640, top: -120, rows: 6, rowStep: 16, band: -108 } as const;
const SIDE = { x0: 640, x1: 760, top: -138, core: 734 } as const;
/** Пост на крыше: стекло шире кверху, как у диспетчерской вышки. */
const CAB = { y0: -134, y1: -150, bottom: [436, 564], top: [426, 574], panes: 8 } as const;

/** Корпус управления: ленты остекления этажей, вестибюль, кровля с агрегатами. */
function MainBlock() {
  const strips = useMemo(() => windowStrips(240, MAIN.rows, MAIN.rowStep, 23, STRIP_TONES.length), []);
  const bands = Array.from({ length: MAIN.rows }, (_, r) => MAIN.band + r * MAIN.rowStep);
  const columns = Array.from({ length: 13 }, (_, i) => 390 + 20 * i);
  return (
    <g>
      <rect x={MAIN.x0} y={MAIN.top} width={MAIN.x1 - MAIN.x0} height={-MAIN.top} fill={url('main')} />
      {bands.map((y) => (
        <g key={y}>
          <rect x="386" y={y} width="248" height="9" fill="#0f1548" />
          <line x1={MAIN.x0} y1={y - 1.5} x2={MAIN.x1} y2={y - 1.5} stroke="#5566e0" strokeOpacity="0.45" />
        </g>
      ))}
      {strips.map((s) => (
        <rect key={`${s.x}-${s.y}`} x={390 + s.x} y={MAIN.band + 2 + s.y} width={s.len} height="5" fill={STRIP_TONES[s.tone]} opacity="0.9" />
      ))}
      {/* Колонны каркаса поверх лент — делят их на окна. */}
      <g stroke="#26318a" strokeWidth="1.3">
        {columns.map((cx) => (
          <line key={cx} x1={cx} y1={MAIN.band} x2={cx} y2={bands[bands.length - 1] + 9} />
        ))}
      </g>
      <line x1={MAIN.x0 + 0.5} y1={MAIN.top} x2={MAIN.x0 + 0.5} y2="0" stroke="#6d7cff" strokeOpacity="0.7" />

      {/* Первый этаж: вестибюль со стеклянным фасадом, козырёк, свет внутри. */}
      <rect x={MAIN.x0} y="-18" width={MAIN.x1 - MAIN.x0} height="18" fill="#141b56" />
      <rect x="468" y="-16" width="84" height="16" fill="#1f5fb0" opacity="0.55" />
      <rect x="470" y="-16" width="80" height="2" fill="#ffe8a0" opacity="0.7" />
      <rect x="501" y="-13" width="18" height="13" fill="#8fe6ff" opacity="0.55" />
      <g stroke="#9fd8ff" strokeOpacity="0.5">
        {[482, 496, 524, 538].map((gx) => (
          <line key={gx} x1={gx} y1="-16" x2={gx} y2="0" />
        ))}
        <line x1="510" y1="-13" x2="510" y2="0" />
      </g>
      <rect x="458" y="-19" width="104" height="3" fill="#9fb4ff" />
      {[400, 424, 590, 614].map((wx) => (
        <rect key={wx} x={wx} y="-12" width="12" height="5" fill="#5ae0ff" opacity="0.35" />
      ))}

      {/* Парапет и агрегаты на кровле. */}
      <rect x={MAIN.x0 - 4} y={MAIN.top - 4} width={MAIN.x1 - MAIN.x0 + 8} height="4" fill="#34439f" />
      <line x1={MAIN.x0 - 4} y1={MAIN.top - 4} x2={MAIN.x1 + 4} y2={MAIN.top - 4} stroke="#7d8cff" strokeWidth="1.2" />
      <rect x="392" y="-131" width="28" height="7" fill="#26307e" stroke="#6d7cff" strokeWidth="0.8" />
      <circle cx="399" cy="-127.5" r="2.4" fill="none" stroke="#9fb4ff" strokeWidth="0.8" />
      <circle cx="413" cy="-127.5" r="2.4" fill="none" stroke="#9fb4ff" strokeWidth="0.8" />
      <rect x="596" y="-130" width="32" height="6" fill="#26307e" stroke="#6d7cff" strokeWidth="0.8" />
      <g stroke="#6d7cff" strokeWidth="0.8">
        {[602, 608, 614, 620].map((vx) => (
          <line key={vx} x1={vx} y1="-129" x2={vx} y2="-125" />
        ))}
      </g>
    </g>
  );
}

/** Застеклённый пост на крыше и тумба радара над ним. */
function Cab() {
  const { y0, y1, bottom, top, panes } = CAB;
  return (
    <g>
      <rect x="448" y={y0} width="104" height={MAIN.top - 4 - y0} fill="#25327e" />
      <rect x="452" y={y0 + 5} width="96" height="2" fill="#5ae0ff" opacity="0.5" />
      <path d={`M${bottom[0]} ${y0} L${bottom[1]} ${y0} L${top[1]} ${y1} L${top[0]} ${y1} Z`} fill={url('glass')} stroke="#8fe6ff" />
      {/* Пульты у нижней кромки стекла и их свет. */}
      <rect x="440" y={y0 - 4} width="120" height="4" fill="#0c1a4a" />
      <rect x="446" y={y0 - 6} width="108" height="1.5" fill="#8fe6ff" opacity="0.55" />
      <g stroke="#9fe6ff" strokeOpacity="0.7">
        {Array.from({ length: panes - 1 }, (_, i) => {
          const k = (i + 1) / panes;
          return (
            <line
              key={i}
              x1={bottom[0] + k * (bottom[1] - bottom[0])}
              y1={y0}
              x2={top[0] + k * (top[1] - top[0])}
              y2={y1}
            />
          );
        })}
      </g>
      <rect x="420" y={y1 - 6} width="160" height="6" fill="#3a4ab8" />
      <line x1="420" y1={y1 - 6} x2="580" y2={y1 - 6} stroke="#9fb4ff" strokeWidth="1.2" />
      <rect x="422" y={y1 - 9} width="2" height="3" fill="#ff3355" />
      <rect x="576" y={y1 - 9} width="2" height="3" fill="#ff3355" />
      {/* Тумба радара: ось головы — `DISH`. */}
      <path d={`M${DISH.x - 10} ${y1 - 6} L${DISH.x + 10} ${y1 - 6} L${DISH.x + 5} -166 L${DISH.x - 5} -166 Z`} fill="#4a5cb8" stroke="#9fb4ff" strokeWidth="0.8" />
      <rect x={DISH.x - 3} y={DISH.y + 2} width="6" height={-166 - DISH.y - 2} fill="#9fb4ff" />
    </g>
  );
}

/** Боковой блок: сетка окон с подоконниками, лестничная клетка, ворота гаража. */
function SideBlock() {
  return (
    <g>
      <rect x={SIDE.x0} y={SIDE.top} width={SIDE.x1 - SIDE.x0} height={-SIDE.top} fill={url('side')} />
      <rect x={SIDE.core} y={SIDE.top} width={SIDE.x1 - SIDE.core} height={-SIDE.top} fill="#203292" />
      {Array.from({ length: 7 }, (_, k) => (
        <rect key={k} x={SIDE.core + 8} y={-128 + 18 * k} width="10" height="8" fill="#ffe2a0" opacity={k % 3 === 1 ? 0.3 : 0.75} />
      ))}
      {Array.from({ length: 24 }, (_, i) => {
        const wx = 650 + (i % 4) * 22;
        const wy = -126 + Math.floor(i / 4) * 19;
        return (
          <g key={i}>
            <rect x={wx - 1} y={wy - 2} width="14" height="10" fill="#182478" />
            <rect x={wx} y={wy} width="12" height="7" fill={i % 7 === 3 ? '#ffe2a0' : '#8fe6ff'} opacity={i % 5 === 2 ? 0.25 : 0.75} />
            <rect x={wx - 1} y={wy + 8} width="14" height="1.2" fill="#9fb4ff" opacity="0.55" />
          </g>
        );
      })}
      {/* Ворота гаража — ламели, над ними фонарь. */}
      <rect x="648" y="-18" width="52" height="18" fill="#2a3a90" stroke="#6d7cff" strokeWidth="0.8" />
      <g stroke="#1a2468">
        {Array.from({ length: 5 }, (_, k) => (
          <line key={k} x1="649" y1={-15 + 3 * k} x2="699" y2={-15 + 3 * k} />
        ))}
      </g>
      <rect x="670" y="-21" width="8" height="1.5" fill="#ffe2a0" />
      {/* Парапет, бак и мачта на кровле. */}
      <rect x={SIDE.x0 - 4} y={SIDE.top - 4} width={SIDE.x1 - SIDE.x0 + 8} height="4" fill="#4a6ae8" />
      <line x1={SIDE.x0 - 4} y1={SIDE.top - 4} x2={SIDE.x1 + 4} y2={SIDE.top - 4} stroke="#b8c8ff" strokeWidth="1.2" />
      <rect x="656" y="-150" width="28" height="8" fill="#26307e" stroke="#6d7cff" strokeWidth="0.8" />
      <g stroke="#c8d4ff" strokeWidth="1.4">
        <line x1="748" y1={SIDE.top - 4} x2="748" y2="-176" />
        <line x1="742" y1="-170" x2="754" y2="-170" />
        <line x1="744" y1="-162" x2="752" y2="-162" />
      </g>
      <rect x="747" y="-180" width="2" height="3" fill="#ff3355" />
    </g>
  );
}

function Control() {
  return (
    <g>
      <Antenna x={330} />
      <MainBlock />
      <SideBlock />
      <Cab />
      <rect x="360" y="-6" width="420" height="6" fill="#141a4a" />
      <line x1="360" y1="-6" x2="780" y2="-6" stroke="#3a4ab8" strokeOpacity="0.8" />
    </g>
  );
}

/**
 * Тарелка в собственной системе: ось поворота — (0, 0), чаша раскрыта вдоль +x.
 * Спина — парабола, внутренняя сторона — эллипс по кромке, в фокусе —
 * облучатель на растяжках. Освещение симметрично оси: голова поворачивается
 * больше чем на 90°, и свет «сверху» оказался бы снизу.
 */
function DishArt() {
  return (
    <>
      <defs>
        <radialGradient id={id('dish')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#cfdcff" />
          <stop offset="1" stopColor="#8fa6ee" />
        </radialGradient>
      </defs>
      <rect x="-7" y="-4" width="9" height="8" fill="#3a4ab8" />
      <path d="M14 -26 Q-14 0 14 26 Z" fill="#6a82e0" stroke="#e6ecff" strokeWidth="1.4" />
      <ellipse cx="14" cy="0" rx="6" ry="26" fill={url('dish')} stroke="#ffffff" />
      <ellipse cx="14" cy="0" rx="3.6" ry="15" fill="none" stroke="#9fb4ff" strokeWidth="0.8" />
      <path d="M14 -24 L38 0 L14 24 M17 0 L38 0" fill="none" stroke="#c8d4ff" strokeWidth="1.2" />
      <rect x="35" y="-3" width="7" height="6" fill="#e6ecff" />
      <circle cx="43" cy="0" r="2.2" fill="#8fe6ff" />
      <circle cx="0" cy="0" r="4.5" fill="#2d3a9e" stroke="#9fb4ff" strokeWidth="1.2" />
    </>
  );
}

const PINGS = [0, 1, 2];

/**
 * Голова радара — HTML-слой на оси тумбы: тарелка ведёт небо рывками с
 * паузами, как следящая станция, а не плавает. Луч и импульсы — дети головы
 * и поворачиваются вместе с ней, второй копии тайминга нет.
 */
function Radar({ left, top, u }: { left: number; top: number; u: number }) {
  return (
    <div className="jpg-radar" style={{ left, top }}>
      <div className="jpg-radar-head">
        <i className="jpg-radar-beam" style={{ width: 380 * u, height: 150 * u }} />
        {PINGS.map((i) => (
          <i key={i} className="jpg-radar-ping" style={{ width: 360 * u, height: 360 * u, '--i': i } as CSSProperties} />
        ))}
        <svg
          className="jpg-radar-dish"
          viewBox="-20 -34 70 68"
          style={{ left: -20 * u, top: -34 * u, width: 70 * u, height: 68 * u }}
        >
          <DishArt />
        </svg>
      </div>
    </div>
  );
}

/** Космодром: `x` — середина плиты старта, `base` — земля зданий, `hull` — масштаб. */
export function Spaceport({ x, base, hull }: { x: number; base: number; hull: number }) {
  const u = hull / 182;
  return (
    <>
      <svg
        className="jpg-art"
        width={VB.w * u}
        height={VB.h * u}
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        style={{ left: x + VB.x * u, top: base + VB.y * u }}
      >
        <Defs />
        <Hangar />
        <Control />
      </svg>
      <Radar left={x + DISH.x * u} top={base + DISH.y * u} u={u} />
    </>
  );
}
