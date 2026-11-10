import { backdropCandles } from '../lib/names';

const CANDLES = backdropCandles(64);
const W = 640;

/**
 * Фон окна барабанов — свечной график, медленно едущий влево, как живой
 * рынок за стеклом. Две одинаковые копии подряд: сдвиг на ширину одной —
 * шва нет. Ходит `transform` слоя, SVG внутри растрируется один раз.
 */
export function ChartBackdrop() {
  const one = (dx: number) =>
    CANDLES.map((k, i) => {
      const x = dx + i * 10 + 5;
      const up = k.c >= k.o;
      const y = (v: number) => 100 - v;
      return (
        <g key={`${dx}:${i}`} className={up ? 'up' : 'down'}>
          <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} />
          <rect x={x - 3} width={6} y={y(Math.max(k.o, k.c))} height={Math.max(0.8, Math.abs(k.c - k.o))} />
        </g>
      );
    });
  return (
    <div className="sl-chartbg" aria-hidden>
      <svg viewBox={`0 0 ${W * 2} 100`} preserveAspectRatio="none">
        {one(0)}
        {one(W)}
      </svg>
    </div>
  );
}
