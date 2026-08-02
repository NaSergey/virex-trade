'use client';

import { useEffect, useRef, useState } from 'react';
import type { RangeCheckResponse } from '@/entities/trade';
import { formatPriceGrouped } from '@/shared/lib/utils/format';

const W = 660;
const H = 240;
// Подписи уровней стоят не в полосе справа, а прямо над своими линиями внутри
// поля — с обводкой фоном, чтобы читались поверх свечей. Полоса съедала пятую
// часть ширины ради двух слов.
const PR = 8;
const PT = 16;
const PB = 18;
const PW = W - PR; // поле со свечами
const GAP = 13; // минимальный просвет между подписями уровней
const MIN_VISIBLE = 6; // дальше приближать нечего — останется частокол

interface Level {
  value: number;
  label: string;
  y: number; // где на самом деле лежит уровень
  ly: number; // куда уехала подпись, чтобы не сесть на соседнюю
}

/**
 * Развести подписи уровней по вертикали: у узкого коридора верх и низ
 * отличаются на доли процента, и подписи садятся друг на друга. Сами линии
 * остаются на своих местах, уезжает только текст.
 */
function spread(levels: Level[]): Level[] {
  const sorted = [...levels].sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const l of sorted) {
    l.ly = Math.max(l.y, prev + GAP);
    prev = l.ly;
  }
  // Если очередь уехала за нижний край — подпираем её снизу вверх.
  let limit = H - 6;
  for (let i = sorted.length - 1; i >= 0; i--) {
    sorted[i].ly = Math.min(sorted[i].ly, limit);
    limit = sorted[i].ly - GAP;
  }
  return sorted;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const at = (unixSec: number) => new Date(unixSec * 1000);
const fmtDay = (t: number) =>
  at(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
const fmtClock = (t: number) => at(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const sameDay = (a: number, b: number) => at(a).toDateString() === at(b).toDateString();

/**
 * Свечи вокруг входа: все, что отдала биржа, с пунктирными верхом и низом того
 * коридора, по которому считался «диапазон входа», и стрелками входа и выхода.
 *
 * Своё SVG, а не lightweight-charts: библиотеке нужны свои цвета, свои шрифты и
 * свои рамки, и всё это приходится переопределять по одному свойству.
 */
export function RangeCheckChart({ data }: { data: RangeCheckResponse }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; from: number; to: number } | null>(null);
  const [span, setSpan] = useState<{ from: number; to: number } | null>(null);
  const [cursor, setCursor] = useState<{ i: number; y: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  const candles = data.candles;
  // Свеча входа и свеча выхода: время уже привязано бэкендом к конкретной свече.
  const entryIdx =
    data.entry.barTime != null ? candles.findIndex((c) => c.time === data.entry.barTime) : -1;
  const exitIdx =
    data.exit.barTime != null ? candles.findIndex((c) => c.time === data.exit.barTime) : -1;

  const len = candles.length;
  // Вид умеет уезжать за края данных, оставляя пустое поле: иначе последние
  // свечи намертво приклеены к правому краю и приближенный участок нельзя
  // подвинуть в середину. Столько свечей всегда остаётся в кадре:
  const edge = Math.min(3, len);
  const count = clamp((span?.to ?? len) - (span?.from ?? 0), MIN_VISIBLE, Math.max(MIN_VISIBLE, len));
  const from = clamp(span?.from ?? 0, edge - count, len - edge);
  const to = from + count;

  // Ширина свечи считается по всему кадру, а не по числу нарисованных свечей, —
  // иначе при заезде за край оставшиеся растянулись бы на всю ширину.
  const bw = PW / count;
  const cx = (i: number) => (i - from) * bw + bw / 2;
  const vFrom = Math.max(0, from);
  const vTo = Math.min(len, to);
  const visible = candles.slice(vFrom, vTo);

  const marks = [data.window.high, data.window.low].filter((v): v is number => v != null);
  const lo = Math.min(...visible.map((c) => c.low), ...marks);
  const hi = Math.max(...visible.map((c) => c.high), ...marks);
  const priceSpan = hi - lo || 1;
  const y = (v: number) => PT + (1 - (v - lo) / priceSpan) * (H - PT - PB);

  const pnlColor = data.closedPnl >= 0 ? 'var(--color-up)' : 'var(--color-down)';
  const long = data.direction === 'long';

  /*
   * Время под свечами. Своё SVG рисовало свечи без единой отметки «когда»,
   * хотя это первое, что спрашивают, глядя на коридор перед входом, — ось
   * времени была у прежней библиотеки и потерялась при переписывании.
   *
   * Ось без линейки и делений: подписи стоят прямо под своими свечами, шагом
   * примерно в пятую часть кадра — при приближении их становится не больше, а
   * подробнее. Дата называется, только когда сменились сутки, в остальных
   * подписях остаются часы: на пятнадцатиминутках день повторялся бы подряд
   * пять раз.
   */
  const daily = data.timeframe === '1d';
  const tickStep = Math.max(1, Math.ceil(count / 5));
  const ticks = visible
    .map((c, k) => ({ time: c.time, i: vFrom + k }))
    .filter(({ i }) => (i - vFrom) % tickStep === 0)
    .map((t, k, all) => ({
      ...t,
      text: daily || k === 0 || !sameDay(t.time, all[k - 1].time) ? fmtDay(t.time) : fmtClock(t.time),
    }));

  // Колесо мыши слушаем вручную: React вешает wheel пассивным, а без
  // preventDefault под курсором вместе с масштабом уезжает и сама модалка.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const scale = W / rect.width;
      const xv = clamp((e.clientX - rect.left) * scale, 0, PW);
      const anchor = from + xv / bw; // свеча под курсором — она и останется на месте
      const next = clamp(Math.round(count * (e.deltaY > 0 ? 1.25 : 0.8)), MIN_VISIBLE, len);
      const nf = clamp(Math.round(anchor - ((anchor - from) / count) * next), edge - next, len - edge);
      setSpan({ from: nf, to: nf + next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [from, to, bw, len]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Без этого браузер начинает своё выделение: подписи и цифры на полотне
    // подсвечиваются синим, а график вместо сдвига стоит на месте.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, from, to };
    setGrabbing(true);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = W / rect.width;
    const drag = dragRef.current;
    if (drag) {
      const shift = Math.round(((drag.x - e.clientX) * scale) / bw);
      const held = drag.to - drag.from;
      const nf = clamp(drag.from + shift, edge - held, len - edge);
      setSpan({ from: nf, to: nf + held });
      return;
    }
    const xv = (e.clientX - rect.left) * scale;
    const yv = (e.clientY - rect.top) * scale;
    const i = from + Math.floor(xv / bw);
    // За краем данных свечи под курсором нет — прицел там не нужен.
    if (xv < 0 || xv > PW || yv < PT - 6 || yv > H - PB + 6 || i < vFrom || i >= vTo) setCursor(null);
    else setCursor({ i, y: yv });
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setGrabbing(false);
  };

  if (len === 0) return null;

  const levels = spread(
    [
      data.window.high != null && { value: data.window.high, label: 'верх' },
      data.window.low != null && { value: data.window.low, label: 'низ' },
    ]
      .filter((l): l is Omit<Level, 'y' | 'ly'> => Boolean(l))
      .map((l) => ({ ...l, y: y(l.value), ly: y(l.value) })),
  );

  /**
   * Стрелка с подписью у своей свечи: снизу под минимумом (смотрит вверх) или
   * сверху над максимумом (смотрит вниз) — как метки сделок на биржевом
   * графике. У лонга вход снизу, выход сверху, у шорта наоборот, поэтому две
   * метки на одной свече никогда не сходятся в одной точке.
   */
  const marker = ({
    idx,
    side,
    label,
    color,
  }: {
    idx: number;
    side: 'above' | 'below';
    label: string;
    color: string;
  }) => {
    // Кадр умеет заезжать за края данных, поэтому попадания в него мало: свечи
    // с таким номером может просто не быть (а при idx = -1 её и не искали).
    const bar = candles[idx];
    if (!bar || idx < from || idx >= to) return null;
    const x = clamp(cx(idx), 20, PW - 20);
    const up = side === 'below'; // стрелка смотрит вверх, на свечу
    // Метка не должна вылезти за поле: если свеча прижата к краю, отступ съедается.
    const base = up ? Math.min(y(bar.low) + 7, H - PB - 20) : Math.max(y(bar.high) - 7, PT + 20);
    const tail = up ? base + 7 : base - 7;
    return (
      <g key={label}>
        <polygon
          points={`${x.toFixed(1)},${base.toFixed(1)} ${(x - 4.5).toFixed(1)},${tail.toFixed(1)} ${(x + 4.5).toFixed(1)},${tail.toFixed(1)}`}
          fill={color}
          stroke="var(--color-background)"
          strokeWidth="0.75"
        />
        <text
          x={x.toFixed(1)}
          y={(up ? tail + 10 : tail - 4).toFixed(1)}
          fill={color}
          fontSize="9"
          fontFamily="var(--font-mono)"
          letterSpacing="0.08em"
          textAnchor="middle"
        >
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: '100%',
        height: 'auto',
        cursor: grabbing ? 'grabbing' : 'crosshair',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      role="img"
      aria-label="Свечи коридора перед входом, его границы и метка входа"
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={(e) => {
        endDrag(e);
        setCursor(null);
      }}
      onDoubleClick={() => setSpan(null)}
    >
      {levels.map((l) => (
        <line
          key={l.label}
          x1="0"
          y1={l.y.toFixed(1)}
          x2={PW}
          y2={l.y.toFixed(1)}
          stroke="var(--color-muted)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}

      {visible.map((c, i) => {
        const x = cx(vFrom + i);
        const up = c.close >= c.open;
        const color = up ? 'var(--color-up)' : 'var(--color-down)';
        const top = Math.min(y(c.open), y(c.close));
        return (
          <g key={c.time}>
            <line
              x1={x.toFixed(1)}
              y1={y(c.high).toFixed(1)}
              x2={x.toFixed(1)}
              y2={y(c.low).toFixed(1)}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={(x - bw * 0.28).toFixed(1)}
              y={top.toFixed(1)}
              width={Math.max(0.8, bw * 0.56).toFixed(1)}
              height={Math.max(1.5, Math.abs(y(c.close) - y(c.open))).toFixed(1)}
              fill={color}
            />
          </g>
        );
      })}

      {/* Маркеры сделки — как на любом торговом графике: стрелка стоит СНАРУЖИ
          своей свечи и смотрит на неё, а не сидит на ценовом уровне. */}
      {marker({
        idx: entryIdx,
        side: long ? 'below' : 'above',
        label: 'ВХОД',
        color: 'var(--color-fg)',
      })}
      {marker({ idx: exitIdx, side: long ? 'above' : 'below', label: 'ВЫХОД', color: pnlColor })}

      {ticks.map((t) => (
        <text
          key={t.i}
          pointerEvents="none"
          x={clamp(cx(t.i), 20, PW - 20).toFixed(1)}
          y={H - 5}
          fill="var(--color-subtle)"
          fontSize="9"
          fontFamily="var(--font-mono)"
          letterSpacing="0.06em"
          textAnchor="middle"
        >
          {t.text}
        </text>
      ))}

      {/* Прицел: вертикаль по свече, горизонталь по курсору и время свечи под
          ними. Цены у горизонтали нет намеренно — уровни коридора подписаны
          своими числами, а ещё один ценник, едущий за курсором, превратил бы
          поле в координатную сетку. */}
      {cursor && (
        <g pointerEvents="none">
          <line
            x1={cx(cursor.i).toFixed(1)}
            y1={PT - 6}
            x2={cx(cursor.i).toFixed(1)}
            y2={(H - PB + 4).toFixed(1)}
            stroke="var(--color-line-2)"
            strokeWidth="1"
          />
          <line
            x1="0"
            y1={cursor.y.toFixed(1)}
            x2={PW}
            y2={cursor.y.toFixed(1)}
            stroke="var(--color-line-2)"
            strokeWidth="1"
          />
          {/* Обводка фоном — подпись встаёт поверх постоянных отметок оси, как
              бегунок на шкале, а не рядом с ними. */}
          <text
            x={clamp(cx(cursor.i), 42, PW - 42).toFixed(1)}
            y={H - 5}
            fill="var(--color-fg)"
            fontSize="9"
            fontFamily="var(--font-mono)"
            letterSpacing="0.06em"
            textAnchor="middle"
            stroke="var(--color-background)"
            strokeWidth="3"
            paintOrder="stroke"
          >
            {daily
              ? fmtDay(candles[cursor.i].time)
              : `${fmtDay(candles[cursor.i].time)} ${fmtClock(candles[cursor.i].time)}`}
          </text>
        </g>
      )}

      {/* Подписи уровней — последними: они поверх всего, включая свечи. */}
      {levels.map((l) => (
        <text
          key={l.label}
          pointerEvents="none"
          x={PW - 2}
          y={(l.ly - 4).toFixed(1)}
          fill="var(--color-muted)"
          fontSize="11"
          fontFamily="var(--font-mono)"
          textAnchor="end"
          stroke="var(--color-background)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {l.label} {formatPriceGrouped(l.value)}
        </text>
      ))}
    </svg>
  );
}
