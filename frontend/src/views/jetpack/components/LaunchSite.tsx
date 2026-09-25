import type { ReactNode } from 'react';

/**
 * Стартовая площадка — в единицах ракеты (`shared/ui/rocket.tsx`: корпус — 182),
 * поэтому растёт и сжимается вместе с ней. Начало координат — земля под
 * серединой ракеты, там стоят стабилизаторы; y вниз.
 *
 * Плоский неон по референсам владельца: ракета стоит на земле, слева —
 * стационарная башня обслуживания (ферма с шахтой лифта, кран, громоотвод,
 * авиационные огни), две её стрелы держат ракету за борт; по сторонам — две
 * тонкие радиомачты. Сама площадка — один неподвижный SVG; движется только
 * своё: стрелы на старте отводятся, свечение под соплом вспыхивает, маяки
 * мигают — это отдельные HTML-слои.
 */

/** Земля под площадкой — на уровне стабилизаторов: плиты нет. */
export const SITE_GROUND = 0;
const VB = { x: -340, y: -380, w: 680, h: 400 } as const;
const MASTS = [-300, 250] as const;
const MAST_TOP = -330;
const NEEDLE = -362;
/** Нижняя доля мачты — лавандовая, верхняя — розовая. */
const SPLIT = 0.6;

const id = (name: string) => `jpg-ls-${name}`;
const url = (name: string) => `url(#${id(name)})`;

function Defs() {
  return (
    <defs>
      <linearGradient id={id('column')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#8fb4ff" />
        <stop offset="0.5" stopColor="#4a64c8" />
        <stop offset="1" stopColor="#2c3c8e" />
      </linearGradient>
      <linearGradient id={id('base')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a3470" />
        <stop offset="1" stopColor="#151a42" />
      </linearGradient>
    </defs>
  );
}

/** Решётчатая мачта: сужается кверху, низ лавандовый, верх розовый, на игле маяк. */
function Mast({ x }: { x: number }) {
  const levels = 14;
  const at = (i: number) => {
    const k = i / levels;
    return { y: MAST_TOP * k, half: 18 - 13 * k };
  };
  const tone = (i: number) => (i / levels >= SPLIT ? '#ff4f8b' : '#8f86ff');
  return (
    <g strokeWidth="1.8" fill="none">
      {Array.from({ length: levels }, (_, i) => {
        const a = at(i);
        const b = at(i + 1);
        return (
          <g key={i} stroke={tone(i)}>
            <path d={`M${x - a.half} ${a.y} L${x - b.half} ${b.y} M${x + a.half} ${a.y} L${x + b.half} ${b.y}`} strokeWidth="2.4" />
            <path d={`M${x - a.half} ${a.y} L${x + b.half} ${b.y} M${x + a.half} ${a.y} L${x - b.half} ${b.y}`} strokeOpacity="0.8" />
            {i / levels >= SPLIT && i % 2 === 0 && (
              <line x1={x - b.half} y1={b.y} x2={x + b.half} y2={b.y} stroke="#ffd0e4" strokeWidth="2.2" />
            )}
          </g>
        );
      })}
      <line x1={x - 8} y1={MAST_TOP} x2={x + 8} y2={MAST_TOP} stroke="#ff4f8b" strokeWidth="3" />
      <line x1={x} y1={MAST_TOP} x2={x} y2={NEEDLE} stroke="#ff4f8b" strokeWidth="2" />
    </g>
  );
}

/**
 * Башня обслуживания — как настоящая стационарная: квадратная в плане ферма
 * (сбоку — две несущие колонны), в каждой секции — раскосы крест-накрест по
 * обе стороны от шахты лифта, на каждом этаже — балка. Выше ракеты — молотовой
 * кран и громоотвод. Шахта лифта — тёмная полоса посередине, кабина с окном
 * стоит на одном из этажей. Плоская «вышка» из брусков, стоявшая до неё,
 * снята владельцем: «вышка должна быть более реалистичная».
 */
const TOWER = { x0: -180, x1: -118, top: -300, shaft: [-156, -142] as const, levels: 10 } as const;
const STEP = -TOWER.top / TOWER.levels;
const MAST_TIP = TOWER.top - 50;

function Tower() {
  const { x0, x1, top, shaft, levels } = TOWER;
  const bays = [
    [x0 + 5, shaft[0]],
    [shaft[1], x1 - 5],
  ] as const;
  return (
    <g>
      {/* Шахта лифта и кабина. */}
      <rect x={shaft[0]} y={top} width={shaft[1] - shaft[0]} height={-top} fill="#121638" />
      <rect x={shaft[0] + 1} y={-162} width={shaft[1] - shaft[0] - 2} height="15" fill="#2a3a8a" />
      <rect x={shaft[0] + 3} y={-159} width={shaft[1] - shaft[0] - 6} height="5" fill="#ffe8a0" />
      {/* Раскосы крест-накрест в каждой секции по обе стороны шахты. */}
      <g stroke="#4a5cb0" strokeWidth="1.3">
        {Array.from({ length: levels }, (_, i) => {
          const y0 = top + i * STEP;
          const y1 = y0 + STEP;
          return bays.map(([a, b]) => <path key={`${i}-${a}`} d={`M${a} ${y0} L${b} ${y1} M${b} ${y0} L${a} ${y1}`} />);
        })}
      </g>
      {/* Балки этажей со светлой кромкой. */}
      {Array.from({ length: levels + 1 }, (_, i) => {
        const y = top + i * STEP;
        return (
          <g key={y}>
            <rect x={x0} y={y - 1.5} width={x1 - x0} height="3" fill="#5a74d8" />
            <line x1={x0} y1={y - 1.5} x2={x1} y2={y - 1.5} stroke="#a8c0ff" strokeOpacity="0.6" strokeWidth="0.8" />
          </g>
        );
      })}
      {/* Несущие колонны. */}
      <rect x={x0} y={top} width="5" height={-top} fill={url('column')} />
      <rect x={x1 - 5} y={top} width="5" height={-top} fill={url('column')} />
      {/* Авиационные огни на углах через три этажа. */}
      {[3, 6, 9].map((k) => (
        <g key={k} fill="#ff3355">
          <circle cx={x0 + 2.5} cy={top + k * STEP - 4} r="2" />
          <circle cx={x1 - 2.5} cy={top + k * STEP - 4} r="2" />
        </g>
      ))}
      {/* Молотовой кран на крыше: стрела, противовес, кабина, крюк. */}
      <rect x={x0 - 26} y={top - 12} width={x1 - x0 + 58} height="6" fill="#3b4f9e" />
      <line x1={x0 - 26} y1={top - 12} x2={x1 + 32} y2={top - 12} stroke="#9fb8ff" strokeOpacity="0.7" strokeWidth="1" />
      <rect x={x0 - 30} y={top - 18} width="16" height="12" fill="#2a3570" />
      <rect x={x1 + 10} y={top - 6} width="12" height="10" fill="#2a3570" />
      <line x1={x1 + 28} y1={top - 6} x2={x1 + 28} y2={top + 26} stroke="#9fb8ff" strokeWidth="1" />
      <rect x={x1 + 25} y={top + 26} width="6" height="5" fill="#9fb8ff" />
      <rect x={x0 + 20} y={top - 6} width={x1 - x0 - 40} height="6" fill="#2a3570" />
      {/* Громоотвод. */}
      <line x1={(x0 + x1) / 2} y1={top - 12} x2={(x0 + x1) / 2} y2={MAST_TIP} stroke="#9fb8ff" strokeWidth="2" />
      {/* Бетонное основание. */}
      <rect x={x0 - 12} y="-12" width={x1 - x0 + 24} height="12" fill={url('base')} />
      <line x1={x0 - 12} y1="-12" x2={x1 + 12} y2="-12" stroke="#6a7ccf" strokeWidth="1" />
    </g>
  );
}

/**
 * Стрела — ферма из двух поясов с раскосами от башни до борта ракеты. `y` —
 * верхний пояс, `to` — где кончается ферма; дальше — насадка у борта.
 */
function Truss({ y, to, depth }: { y: number; to: number; depth: number }) {
  const from = TOWER.x1;
  const n = Math.max(3, Math.round((to - from) / 12));
  const dx = (to - from) / n;
  return (
    <g>
      <rect x={from} y={y} width={to - from} height="3" fill="#6ea8ff" />
      <rect x={from} y={y + depth - 3} width={to - from} height="3" fill="#4a7ce0" />
      <g stroke="#5a8ae8" strokeWidth="1.3">
        {Array.from({ length: n }, (_, i) => (
          <line
            key={i}
            x1={from + i * dx}
            y1={y + (i % 2 ? depth : 0)}
            x2={from + (i + 1) * dx}
            y2={y + (i % 2 ? 0 : depth)}
          />
        ))}
      </g>
      <line x1={from} y1={y} x2={to} y2={y} stroke="#d4f2ff" strokeOpacity="0.8" strokeWidth="1" />
    </g>
  );
}

/**
 * Стрелы держат ракету за борт. Борт на середине «белой комнаты» — x = −26.5
 * (там нос уже сужается), у разъёма кабельной — x = −34.5: точки сняты с
 * кривой корпуса `BODY`. На старте стрелы
 * отводятся, как у настоящих башен: поворачиваются в глубину, и сбоку видно,
 * как они укорачиваются к башне (`scale` по x вокруг кромки башни).
 */
const CREW = { y: -192, depth: 14, room: [-42, -26.5] as const, h: 26 } as const;
const UMB = { y: -114, depth: 10, plate: [-44, -34.5] as const } as const;
const box = (y0: number, y1: number, x1: number) => ({ x: TOWER.x1, y: y0, w: x1 - TOWER.x1, h: y1 - y0 });
const CREW_BOX = box(CREW.y - 6, CREW.y + CREW.h, CREW.room[1]);
const UMB_BOX = box(UMB.y - 4, UMB.y + 34, UMB.plate[1]);

/** Стрела экипажа: ферма и «белая комната» у люка — кабина, прижатая к борту. */
function CrewArm() {
  const [r0, r1] = CREW.room;
  return (
    <>
      <Truss y={CREW.y} to={r0} depth={CREW.depth} />
      <rect x={r0} y={CREW.y - 6} width={r1 - r0} height={CREW.h} fill="#dfe8ff" />
      <rect x={r0 + 3} y={CREW.y} width={r1 - r0 - 7} height="7" fill="#8fd6ff" />
      <line x1={r1} y1={CREW.y - 6} x2={r1} y2={CREW.y - 6 + CREW.h} stroke="#9a5cff" strokeWidth="1.4" />
    </>
  );
}

/** Кабельная стрела: ферма, кабели провисают к разъёму на борту. */
function UmbilicalArm() {
  const [p0, p1] = UMB.plate;
  const bottom = UMB.y + UMB.depth;
  return (
    <>
      <Truss y={UMB.y} to={p0} depth={UMB.depth} />
      <g stroke="#9fb4ff" strokeWidth="1.8" fill="none">
        <path d={`M${p0 - 30} ${bottom} Q${p0 - 16} ${bottom + 22} ${p0 + 2} ${bottom + 12}`} />
        <path d={`M${p0 - 48} ${bottom} Q${p0 - 24} ${bottom + 30} ${p0 + 2} ${bottom + 18}`} />
      </g>
      <rect x={p0} y={UMB.y - 2} width={p1 - p0} height={bottom + 24 - UMB.y} fill="#c8d4ff" />
      <line x1={p1} y1={UMB.y - 2} x2={p1} y2={bottom + 22} stroke="#9a5cff" strokeWidth="1.2" />
    </>
  );
}

/** Подвижный слой стрелы: свой SVG, точка поворота — кромка башни. */
function ArmLayer({
  area,
  at,
  u,
  launched,
  late,
  children,
}: {
  area: { x: number; y: number; w: number; h: number };
  at: (x: number, y: number) => { left: number; top: number };
  u: number;
  launched: boolean;
  late?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={late ? 'jpg-arm late' : 'jpg-arm'}
      data-launched={launched || undefined}
      style={{ ...at(area.x, area.y), width: area.w * u, height: area.h * u, transformOrigin: '0 50%' }}
    >
      <svg viewBox={`${area.x} ${area.y} ${area.w} ${area.h}`} fill="none" aria-hidden>
        {children}
      </svg>
    </div>
  );
}

/**
 * Площадка на месте старта: `x` — середина под ракетой, `top` — земля (там
 * стоят стабилизаторы), `hull` — длина корпуса в пикселях, от неё масштаб.
 * `launched` — раунд, который взлетел: стрелы отводятся, свечение под соплом
 * вспыхивает (ключ раунда перезапускает вспышку у каждого старта).
 */
export function LaunchSite({ x, top, hull, launched }: { x: number; top: number; hull: number; launched: string | null }) {
  const u = hull / 182;
  const at = (lx: number, ly: number) => ({ left: x + lx * u, top: top + ly * u });
  return (
    <>
      <svg
        className="jpg-art"
        width={VB.w * u}
        height={VB.h * u}
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        style={at(VB.x, VB.y)}
      >
        <Defs />
        {MASTS.map((mx) => (
          <Mast key={mx} x={mx} />
        ))}
        <Tower />
      </svg>

      <i
        key={launched ?? 'idle'}
        className="jpg-trench-glow"
        data-launched={launched ? true : undefined}
        style={{ ...at(0, 0), width: 220 * u, height: 90 * u }}
      />
      <ArmLayer area={UMB_BOX} at={at} u={u} launched={!!launched} late>
        <UmbilicalArm />
      </ArmLayer>
      <ArmLayer area={CREW_BOX} at={at} u={u} launched={!!launched}>
        <CrewArm />
      </ArmLayer>
      <i className="jpg-beacon" style={at((TOWER.x0 + TOWER.x1) / 2, MAST_TIP)} />
      <i className="jpg-beacon" style={at(MASTS[0], NEEDLE)} />
      <i className="jpg-beacon late" style={at(MASTS[1], NEEDLE)} />
    </>
  );
}
