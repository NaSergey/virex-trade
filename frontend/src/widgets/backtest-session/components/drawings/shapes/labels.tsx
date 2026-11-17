import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { DrawingKind } from '../../../lib/drawings/types';
import type { ShapeRenderer } from './ctx';

/** Кегль надписи по толщине фигуры — как у «Текста». */
const TEXT_SIZE = { 1: 11, 2: 13, 3: 16 } as const;

/**
 * Выноска: острие в первой точке, надпись в рамке — во второй. Текст правится
 * там же, где у «Текста» (`DrawingStyleBar`); пустой — подсказка.
 */
const callout: ShapeRenderer = (d, c) => {
  const [tip, box] = d.points;
  const { xOf, yOf, px } = c.geo;
  const size = px(TEXT_SIZE[d.width]);
  const label = d.text?.trim() || c.t('textPlaceholder');
  const lines = label.split('\n');
  const pad = px(6);
  const w = Math.max(...lines.map((l) => l.length)) * size * 0.62 + pad * 2;
  const h = lines.length * size * 1.25 + pad;
  const x = xOf(box.t);
  const y = yOf(box.p);
  const xt = xOf(tip.t);
  const yt = yOf(tip.p);
  // Острие идёт к ближайшему краю рамки, а не в угол: так выноска читается с любой стороны.
  const ex = Math.min(Math.max(xt, x), x + w);
  const ey = Math.min(Math.max(yt, y), y + h);
  return (
    <>
      <line x1={xt} y1={yt} x2={ex} y2={ey} {...c.line} />
      <rect x={x} y={y} width={w} height={h} fill={c.color} fillOpacity={0.15} stroke={c.color} strokeWidth={c.geo.px(1)} {...c.hitProps()} />
      <text
        x={x + pad}
        y={y + pad / 2 + size}
        fill={c.color}
        fillOpacity={d.text?.trim() ? 1 : 0.55}
        fontSize={size}
        fontFamily="var(--font-sans)"
        pointerEvents="none"
      >
        {lines.map((l, i) => (
          <tspan key={i} x={x + pad} dy={i === 0 ? 0 : size * 1.25}>
            {l}
          </tspan>
        ))}
      </text>
      {c.hitLine(xt, yt, ex, ey)}
    </>
  );
};

/** Ценовая метка: плашка с ценой точки и уголком к ней. */
const priceLabel: ShapeRenderer = (d, c) => {
  const [a] = d.points;
  const { xOf, yOf, px } = c.geo;
  const text = formatPriceGrouped(a.p, c.geo.priceDecimals);
  const x = xOf(a.t);
  const y = yOf(a.p);
  const h = px(18);
  const w = text.length * px(10) * 0.62 + px(12);
  const nose = px(6);
  const p = `M${x} ${y}L${x + nose} ${y - h / 2}H${x + nose + w}V${y + h / 2}H${x + nose}Z`;
  return (
    <>
      <path d={p} fill={c.color} {...c.hitProps()} />
      <text x={x + nose + px(6)} y={y + px(3.5)} fill="var(--color-app)" pointerEvents="none" {...c.font}>
        {text}
      </text>
    </>
  );
};

/** Флажок: древко вверх от точки и полотнище. */
const flag: ShapeRenderer = (d, c) => {
  const [a] = d.points;
  const { xOf, yOf, px } = c.geo;
  const x = xOf(a.t);
  const y = yOf(a.p);
  const pole = px(24);
  const p = `M${x} ${y - pole}h${px(14)}l${-px(3)} ${px(5)}l${px(3)} ${px(5)}h${-px(14)}Z`;
  return (
    <>
      <line x1={x} y1={y} x2={x} y2={y - pole} stroke={c.color} strokeWidth={c.geo.px(1.5)} strokeLinecap="round" pointerEvents="none" />
      <path d={p} fill={c.color} pointerEvents="none" />
      <rect x={x - px(3)} y={y - pole} width={px(18)} height={pole} fill="transparent" {...c.hitProps()} />
    </>
  );
};

export const LABEL_SHAPES: Partial<Record<DrawingKind, ShapeRenderer>> = { callout, priceLabel, flag };
