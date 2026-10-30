'use client';

import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useTradeCandles } from '../api/hooks';
import type { TradeRow } from '../api/types';
import { fmtPrice, OUTCOME_LABELS } from '../model/format';

const CW = 6;
const H = 260;

/**
 * Сделка на свечах ТФ сетапа: уровень ликвидности, свип, FVG, BOS, ордерблок,
 * вход, стоп, цель и выход — чтобы глазами сверить, как система поняла правила.
 */
export function TradeChart({ trade }: { trade: TradeRow }) {
  const q = useTradeCandles(trade);
  if (q.isLoading) return <Skeleton height={H} />;
  if (q.error) return <ErrorNote error={q.error} fallback="Свечи не загрузились" />;
  const cs = q.data ?? [];
  if (!cs.length) return <p className="muted">Свечей за этот отрезок нет.</p>;

  const times = cs.map((c) => Date.parse(c.time));
  const W = cs.length * CW;
  let lo = Math.min(trade.stop, trade.target, trade.level);
  let hi = Math.max(trade.stop, trade.target, trade.level);
  for (const c of cs) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  const y = (p: number) => 10 + (1 - (p - lo) / (hi - lo || 1)) * (H - 20);
  const idx = (ms: number) => {
    let k = 0;
    while (k + 1 < times.length && times[k + 1] <= ms) k++;
    return k;
  };
  const cx = (k: number) => k * CW + CW / 2;
  const sweep = idx(trade.sweepMs);
  const confirm = idx(trade.confirmMs - trade.tf * 60_000);
  const exit = idx(trade.exitMs - 1);
  const fill = idx(trade.fillMs);
  const ob = idx(trade.obMs);
  const font = Math.max(9, W / 90);
  const tags: [number | null, string][] = [
    [sweep, 'свип'],
    [trade.fvgMs != null ? idx(trade.fvgMs) : null, 'FVG'],
    [trade.bosMs != null ? idx(trade.bosMs) : null, 'BOS'],
  ];
  const levels = [
    ['entry', trade.entry],
    ['stop', trade.stop],
    ['target', trade.target],
  ] as const;

  return (
    <div className="st-trade">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Сделка на графике">
        <rect
          className="st-ob"
          x={cx(ob) - CW / 2}
          width={cx(exit) - cx(ob) + CW}
          y={y(Math.max(trade.entry, trade.stop))}
          height={Math.abs(y(trade.stop) - y(trade.entry))}
        />
        <line className="st-lvl st-lvl-pool" x1={0} x2={cx(sweep)} y1={y(trade.level)} y2={y(trade.level)} />
        {cs.map((c, k) => {
          const up = c.close >= c.open;
          return (
            <g key={c.time} className={up ? 'st-candle-up' : 'st-candle-down'}>
              <line x1={cx(k)} x2={cx(k)} y1={y(c.high)} y2={y(c.low)} strokeWidth={1} />
              <rect
                x={k * CW + 1}
                width={CW - 2}
                y={y(Math.max(c.open, c.close))}
                height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
              />
            </g>
          );
        })}
        {levels.map(([k, p]) => (
          <line key={k} className={`st-lvl st-lvl-${k}`} x1={cx(confirm)} x2={cx(exit)} y1={y(p)} y2={y(p)} />
        ))}
        {tags.map(([k, label]) =>
          k == null ? null : (
            <text key={label} className="st-tag" x={cx(k)} y={font} fontSize={font} textAnchor="middle">
              {label}
            </text>
          ),
        )}
        <circle cx={cx(fill)} cy={y(trade.fill)} r={CW / 2} className="st-tag" />
        <circle cx={cx(exit)} cy={y(trade.exit)} r={CW / 2} className="st-tag" />
      </svg>
      <p className="muted">
        Вход {fmtPrice(trade.fill)}, стоп {fmtPrice(trade.stop)}, цель {fmtPrice(trade.target)}, уровень ликвидности{' '}
        {fmtPrice(trade.level)}; выход {fmtPrice(trade.exit)} — {OUTCOME_LABELS[trade.outcome]}. Время — UTC.
      </p>
    </div>
  );
}
