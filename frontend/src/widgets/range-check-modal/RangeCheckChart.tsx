'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { RangeCheckResponse } from '@/entities/trade';
import { useNonPassiveWheel } from '@/shared/lib/hooks/useNonPassiveWheel';
import { Skeleton } from '@/shared/ui/Skeleton';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { useLocaleControl } from '@/shared/i18n';

const W = 660;
const H = 240;
/**
 * В каких пределах холст стоит на экране. Пропорция 660:240 задана под окно
 * разбора сделки на большом экране; на телефоне окно вчетверо уже, и те же 240
 * единиц оборачивались сотней пикселей — свечи превращались в частокол щепок.
 */
const MIN_PX = 200;
const MAX_PX = 330;
// Подписи уровней стоят не в полосе справа, а прямо над своими линиями внутри
// поля — с обводкой фоном, чтобы читались поверх свечей. Полоса съедала пятую
// часть ширины ради двух слов.
const PR = 8;
const PT = 16;
const PB = 18;
const PW = W - PR; // поле со свечами
const GAP = 13; // минимальный просвет между подписями уровней, в экранных пикселях
const MIN_VISIBLE = 6; // дальше приближать нечего — останется частокол
const MARK_GAP = 40; // ближе подписи меток под свечами налезают друг на друга, в экранных пикселях

interface Level {
  value: number;
  label: string;
  avg?: boolean; // средняя цена входа, а не граница коридора
  y: number; // где на самом деле лежит уровень
  ly: number; // куда уехала подпись, чтобы не сесть на соседнюю
}

/**
 * Развести подписи уровней по вертикали: у узкого коридора верх и низ
 * отличаются на доли процента, и подписи садятся друг на друга. Сами линии
 * остаются на своих местах, уезжает только текст.
 */
function spread(levels: Level[], gap: number, bottom: number): Level[] {
  const sorted = [...levels].sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const l of sorted) {
    l.ly = Math.max(l.y, prev + gap);
    prev = l.ly;
  }
  // Если очередь уехала за нижний край — подпираем её снизу вверх.
  let limit = bottom;
  for (let i = sorted.length - 1; i >= 0; i--) {
    sorted[i].ly = Math.min(sorted[i].ly, limit);
    limit = sorted[i].ly - gap;
  }
  return sorted;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const at = (unixSec: number) => new Date(unixSec * 1000);
const fmtDay = (t: number, locale: string) =>
  at(t).toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace('.', '');
const fmtClock = (t: number, locale: string) => at(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
const sameDay = (a: number, b: number) => at(a).toDateString() === at(b).toDateString();

/**
 * Заглушка на месте графика — ровно тех же размеров, что займёт сам график.
 *
 * Стоит рядом с ним, а не в окне, потому что размеры холста заданы здесь: полоса
 * произвольной высоты сдвигала бы всё, что ниже, в тот момент, когда свечи
 * пришли, — и открытое окно дёргалось бы уже после открытия.
 */
export function RangeCheckChartSkeleton() {
  return (
    <div style={{ aspectRatio: `${W} / ${H}`, minHeight: MIN_PX, maxHeight: MAX_PX }}>
      <Skeleton height="100%" flush />
    </div>
  );
}

/** Один ордер на вход: первый открыл позицию, остальные — доборы. */
export interface RangeEntryFill {
  price: number;
  time: number; // unix seconds
}

/**
 * Свечи вокруг входа: все, что отдала биржа, с пунктирными верхом и низом того
 * коридора, по которому считался «диапазон входа», линией средней цены входа и
 * стрелками входа, доборов и выхода.
 *
 * Своё SVG, а не lightweight-charts: библиотеке нужны свои цвета, свои шрифты и
 * свои рамки, и всё это приходится переопределять по одному свойству.
 */
export function RangeCheckChart({
  data,
  avgEntry,
  entries = [],
}: {
  data: RangeCheckResponse;
  /** Средняя цена входа позиции — та же, что в заголовке окна. */
  avgEntry: number;
  /** Ордера на вход по времени; пусто — история исполнений не подтянута. */
  entries?: RangeEntryFill[];
}) {
  const t = useTranslations('rangeCheck');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const svgRef = useRef<SVGSVGElement>(null);
  // Двоеточия из useId в url(#...) не годятся — убираем; своего счётчика не
  // заводим: две модалки подряд получили бы один id.
  const clipId = `range-plot-${useId().replace(/:/g, '')}`;
  const dragRef = useRef<{ x: number; from: number; to: number } | null>(null);
  const [span, setSpan] = useState<{ from: number; to: number } | null>(null);
  const [cursor, setCursor] = useState<{ i: number; y: number } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [boxW, setBoxW] = useState(0);

  // Холст масштабируется целиком: на телефоне одна его единица — половина
  // экранного пикселя, и подписи, набранные девятью единицами, выходили в
  // четыре пикселя. Меряем ширину и переводим все пиксельные мерки — кегли,
  // толщины, просветы между подписями — в единицы холста.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Сколько единиц холста приходится на один экранный пиксель. */
  const u = boxW > 0 ? W / boxW : 1;
  /** Экранные пиксели → единицы холста. */
  const px = (n: number) => n * u;
  // Высота холста — от измеренной ширины, чтобы на экране он не выходил из
  // MIN_PX…MAX_PX. В широком окне счёт возвращает объявленные 240.
  const h =
    boxW > 0
      ? Math.round((Math.min(MAX_PX, Math.max(MIN_PX, (boxW * H) / W)) * W) / boxW)
      : H;

  const candles = data.candles;
  // Свеча входа и свеча выхода: время уже привязано бэкендом к конкретной свече.
  const entryIdx =
    data.entry.barTime != null ? candles.findIndex((c) => c.time === data.entry.barTime) : -1;
  const exitIdx =
    data.exit.barTime != null ? candles.findIndex((c) => c.time === data.exit.barTime) : -1;

  // Ордера на вход — к свече, внутри которой они исполнены: последней, что
  // открылась не позже ордера (так же бэкенд привязывает вход и выход).
  const barIndexOf = (sec: number) => {
    let found = -1;
    for (let i = 0; i < candles.length && candles[i].time <= sec; i++) found = i;
    return found;
  };
  const fills = entries.map((e) => ({ price: e.price, i: barIndexOf(e.time) })).filter((f) => f.i >= 0);
  // Свечи с ордерами на вход: первая — сам вход, остальные — доборы. Несколько
  // ордеров в одной свече — одна метка, сколько их было, говорят точки цены.
  const entryBars = [...new Set(fills.map((f) => f.i))].sort((a, b) => a - b);
  const firstEntryIdx = entryBars[0] ?? entryIdx;
  const hasAdds = entries.length > 1;

  const len = candles.length;
  // Вид умеет уезжать за края данных, оставляя пустое поле: иначе последние
  // свечи намертво приклеены к правому краю и приближенный участок нельзя
  // подвинуть в середину. Столько свечей всегда остаётся в кадре:
  const edge = Math.min(3, len);
  // Свечей в кадре — целое число, а вот НАЧАЛО кадра дробное: 22.5 значит,
  // что слева видна половина свечи 22. Целое начало означало бы, что сдвиг
  // ходит только по свече за раз, а жест непрерывный: на приближенном
  // участке, где свеча шириной под сотню единиц холста, график вместо
  // следования за курсором прыгает через неё.
  const count = Math.round(clamp((span?.to ?? len) - (span?.from ?? 0), MIN_VISIBLE, Math.max(MIN_VISIBLE, len)));
  const from = clamp(span?.from ?? 0, edge - count, len - edge);
  const to = from + count;

  // Ширина свечи считается по всему кадру, а не по числу нарисованных свечей, —
  // иначе при заезде за край оставшиеся растянулись бы на всю ширину.
  const bw = PW / count;
  const cx = (i: number) => (i - from) * bw + bw / 2;
  // Крайние свечи берём целиком: они видны половинками, поэтому поле со
  // свечами обрезается по ширине (clipPath ниже).
  const vFrom = Math.max(0, Math.floor(from));
  const vTo = Math.min(len, Math.ceil(to));
  const visible = candles.slice(vFrom, vTo);

  const marks = [data.window.high, data.window.low, avgEntry].filter((v): v is number => v != null);
  const lo = Math.min(...visible.map((c) => c.low), ...marks);
  const hi = Math.max(...visible.map((c) => c.high), ...marks);
  const priceSpan = hi - lo || 1;
  const y = (v: number) => PT + (1 - (v - lo) / priceSpan) * (h - PT - PB);

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
    .map((tick, k, all) => ({
      ...tick,
      text:
        daily || k === 0 || !sameDay(tick.time, all[k - 1].time)
          ? fmtDay(tick.time, intlLocale)
          : fmtClock(tick.time, intlLocale),
    }));

  // Колесо мыши слушаем через общий хук: React держит onWheel пассивным, а
  // без preventDefault под курсором вместе с масштабом уезжает и сама модалка.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      const el = svgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scale = W / rect.width;
      const xv = clamp((e.clientX - rect.left) * scale, 0, PW);
      const anchor = from + xv / bw; // свеча под курсором — она и останется на месте
      const next = clamp(Math.round(count * (e.deltaY > 0 ? 1.25 : 0.8)), MIN_VISIBLE, len);
      // Округляется только число свечей: округлённое начало кадра дёргало бы
      // картинку ещё и на полсвечи вбок и стирало дробное положение, набранное
      // сдвигом.
      const nf = clamp(anchor - ((anchor - from) / count) * next, edge - next, len - edge);
      setSpan({ from: nf, to: nf + next });
    },
    [from, to, bw, len],
  );
  useNonPassiveWheel(svgRef, onWheel);

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
      // Сдвиг в долях свечи, без округления: жест непрерывный, и кадр обязан
      // идти за курсором 1:1, а не копить отставание до полусвечи и отдавать
      // его скачком.
      const shift = ((drag.x - e.clientX) * scale) / bw;
      const held = drag.to - drag.from;
      const nf = clamp(drag.from + shift, edge - held, len - edge);
      setSpan({ from: nf, to: nf + held });
      return;
    }
    const xv = (e.clientX - rect.left) * scale;
    const yv = (e.clientY - rect.top) * scale;
    const i = Math.floor(from + xv / bw);
    // За краем данных свечи под курсором нет — прицел там не нужен.
    if (xv < 0 || xv > PW || yv < PT - px(6) || yv > h - PB + px(6) || i < vFrom || i >= vTo) setCursor(null);
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
      data.window.high != null && { value: data.window.high, label: t('levelHigh') },
      data.window.low != null && { value: data.window.low, label: t('levelLow') },
      { value: avgEntry, label: t(hasAdds ? 'levelAvg' : 'levelEntry'), avg: true },
    ]
      .filter((l): l is Omit<Level, 'y' | 'ly'> => Boolean(l))
      .map((l) => ({ ...l, y: y(l.value), ly: y(l.value) })),
    px(GAP),
    h - px(6),
  );

  // Кадр умеет заезжать за края данных, поэтому попадания в него мало: свечи
  // с таким номером может просто не быть (а при idx = -1 её и не искали).
  const onScreen = (idx: number) => candles[idx] != null && idx >= vFrom && idx < vTo;
  const markX = (idx: number) => clamp(cx(idx), px(20), PW - px(20));

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
    text = true,
  }: {
    idx: number;
    side: 'above' | 'below';
    label: string;
    color: string;
    /** Подпись у стрелки; без неё — одна стрелка, когда соседняя метка уже подписана. */
    text?: boolean;
  }) => {
    if (!onScreen(idx)) return null;
    const bar = candles[idx];
    const x = markX(idx);
    const up = side === 'below'; // стрелка смотрит вверх, на свечу
    // Метка не должна вылезти за поле: если свеча прижата к краю, отступ съедается.
    const base = up
      ? Math.min(y(bar.low) + px(7), h - PB - px(20))
      : Math.max(y(bar.high) - px(7), PT + px(20));
    const tail = up ? base + px(7) : base - px(7);
    return (
      <g key={`${label}-${idx}`}>
        <polygon
          points={`${x.toFixed(1)},${base.toFixed(1)} ${(x - px(4.5)).toFixed(1)},${tail.toFixed(1)} ${(x + px(4.5)).toFixed(1)},${tail.toFixed(1)}`}
          fill={color}
          stroke="var(--color-background)"
          strokeWidth={px(0.75).toFixed(2)}
        />
        {text && (
          <text
            x={x.toFixed(1)}
            y={(up ? tail + px(10) : tail - px(4)).toFixed(1)}
            fill={color}
            fontSize={px(9).toFixed(1)}
            fontFamily="var(--font-mono)"
            letterSpacing="0.08em"
            textAnchor="middle"
          >
            {label}
          </text>
        )}
      </g>
    );
  };

  /*
   * Вход и доборы стоят по одну сторону свечей, и на мелком масштабе соседние
   * доборы оказываются в паре свечей друг от друга — подписи слились бы в
   * кашу. Подписан вход и те доборы, что отошли от уже подписанных; остальные
   * остаются стрелками.
   */
  const entrySide = long ? 'below' : 'above';
  const labelled: number[] = [];
  const entryMarks = [
    { idx: firstEntryIdx, label: t('markerEntry'), color: 'var(--color-fg)' },
    ...entryBars.slice(1).map((idx) => ({ idx, label: t('markerAdd'), color: 'var(--color-muted)' })),
  ]
    .filter((m) => onScreen(m.idx))
    .map((m) => {
      const x = markX(m.idx);
      const text = labelled.every((lx) => Math.abs(lx - x) >= px(MARK_GAP));
      if (text) labelled.push(x);
      return { ...m, text };
    });
  const avg = levels.find((l) => l.avg);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${h}`}
      style={{
        width: '100%',
        height: 'auto',
        cursor: grabbing ? 'grabbing' : 'crosshair',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      role="img"
      aria-label={t('chartAriaLabel')}
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
      {levels.filter((l) => !l.avg).map((l) => (
        <line
          key={l.label}
          x1="0"
          y1={l.y.toFixed(1)}
          x2={PW}
          y2={l.y.toFixed(1)}
          stroke="var(--color-muted)"
          strokeWidth={u.toFixed(2)}
          strokeDasharray={`${px(3).toFixed(1)} ${px(4).toFixed(1)}`}
        />
      ))}

      {/* Кадр стоит дробно, крайние свечи видны половинками — поле со свечами
          режется по ширине, иначе половинка вылезала бы за него, на поля
          холста и подписи уровней. */}
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={PW} height={h} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`}>
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
                strokeWidth={u.toFixed(2)}
              />
              <rect
                x={(x - bw * 0.28).toFixed(1)}
                y={top.toFixed(1)}
                width={Math.max(px(0.8), bw * 0.56).toFixed(1)}
                height={Math.max(px(1.5), Math.abs(y(c.close) - y(c.open))).toFixed(1)}
                fill={color}
              />
            </g>
          );
        })}

        {/* Средняя — поверх свечей, как линия позиции на биржевом графике: под
            ними она терялась бы в телах ровно там, где цена к ней возвращалась.
            Точки — цена каждого ордера на вход в своей свече: по ним видно,
            откуда средняя взялась. */}
        {avg && (
          <line
            x1="0"
            y1={avg.y.toFixed(1)}
            x2={PW}
            y2={avg.y.toFixed(1)}
            stroke="var(--color-fg)"
            strokeOpacity={0.6}
            strokeWidth={u.toFixed(2)}
          />
        )}
        {fills
          .filter((f) => f.i >= vFrom && f.i < vTo)
          .map((f, k) => (
            <circle
              key={k}
              cx={cx(f.i).toFixed(1)}
              cy={y(f.price).toFixed(1)}
              r={px(2.5).toFixed(1)}
              fill="var(--color-fg)"
              stroke="var(--color-background)"
              strokeWidth={px(1).toFixed(2)}
            />
          ))}
      </g>

      {/* Маркеры сделки — как на любом торговом графике: стрелка стоит СНАРУЖИ
          своей свечи и смотрит на неё, а не сидит на ценовом уровне. */}
      {entryMarks.map((m) => marker({ ...m, side: entrySide }))}
      {marker({ idx: exitIdx, side: long ? 'above' : 'below', label: t('markerExit'), color: pnlColor })}

      {ticks.map((t) => (
        <text
          key={t.i}
          pointerEvents="none"
          x={clamp(cx(t.i), px(20), PW - px(20)).toFixed(1)}
          y={(h - px(5)).toFixed(1)}
          fill="var(--color-subtle)"
          fontSize={px(9).toFixed(1)}
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
            y1={(PT - px(6)).toFixed(1)}
            x2={cx(cursor.i).toFixed(1)}
            y2={(h - PB + px(4)).toFixed(1)}
            stroke="var(--color-line-2)"
            strokeWidth={u.toFixed(2)}
          />
          <line
            x1="0"
            y1={cursor.y.toFixed(1)}
            x2={PW}
            y2={cursor.y.toFixed(1)}
            stroke="var(--color-line-2)"
            strokeWidth={u.toFixed(2)}
          />
          {/* Обводка фоном — подпись встаёт поверх постоянных отметок оси, как
              бегунок на шкале, а не рядом с ними. */}
          <text
            x={clamp(cx(cursor.i), px(42), PW - px(42)).toFixed(1)}
            y={(h - px(5)).toFixed(1)}
            fill="var(--color-fg)"
            fontSize={px(9).toFixed(1)}
            fontFamily="var(--font-mono)"
            letterSpacing="0.06em"
            textAnchor="middle"
            stroke="var(--color-background)"
            strokeWidth={px(3).toFixed(1)}
            paintOrder="stroke"
          >
            {daily
              ? fmtDay(candles[cursor.i].time, intlLocale)
              : `${fmtDay(candles[cursor.i].time, intlLocale)} ${fmtClock(candles[cursor.i].time, intlLocale)}`}
          </text>
        </g>
      )}

      {/* Подписи уровней — последними: они поверх всего, включая свечи. */}
      {levels.map((l) => (
        <text
          key={l.label}
          pointerEvents="none"
          x={(PW - px(2)).toFixed(1)}
          y={(l.ly - px(4)).toFixed(1)}
          fill={l.avg ? 'var(--color-fg)' : 'var(--color-muted)'}
          fontSize={px(11).toFixed(1)}
          fontFamily="var(--font-mono)"
          textAnchor="end"
          stroke="var(--color-background)"
          strokeWidth={px(3).toFixed(1)}
          paintOrder="stroke"
        >
          {l.label} {formatPriceGrouped(l.value)}
        </text>
      ))}
    </svg>
  );
}
