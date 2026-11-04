'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils/css';
import { STATION } from '../labels';
import { reachable } from '../model/map';
import type { Action, RunState } from '../model/engine';

type Dispatch = (a: Action) => void;

const LANE_X = [70, 160, 250];
const ROW_H = 58;
const TOP = 34;

const yOf = (row: number) => TOP + (row - 1) * ROW_H;

const goTo = (dispatch: Dispatch, id: string) => dispatch({ type: 'go', station: id, now: Date.now() });

/**
 * Схема линии сверху вниз, как в метро: толстая линия, станции — кружки со
 * значком типа. Пройденное — сплошной линией, куда можно — подсвечено; те же
 * станции — кнопками под схемой, пальцу по ним попадать проще.
 */
export function LineMap({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const byId = new Map(run.map.map((s) => [s.id, s]));
  const next = new Set(reachable(run.map, run.at));
  const here = run.at ? byId.get(run.at) : null;
  const visited = new Set(run.path);
  const walked = new Set(run.path.slice(1).map((id, i) => `${run.path[i]}-${id}`));
  const go = (id: string) => goTo(dispatch, id);

  const scroller = useRef<SVGSVGElement>(null);
  useEffect(() => {
    scroller.current?.querySelector('[data-next]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [run.at]);

  const height = TOP + 9 * ROW_H + 40;
  return (
    <section className="eg-map">
      <svg ref={scroller} className="eg-map-svg" viewBox={`0 0 320 ${height}`} role="img" aria-label="Схема линии">
        {run.map.flatMap((s) =>
          s.next.map((n) => {
            const t = byId.get(n)!;
            const live = s.id === run.at && next.has(n);
            return (
              <line
                key={`${s.id}-${n}`}
                x1={LANE_X[s.lane]}
                y1={yOf(s.row)}
                x2={LANE_X[t.lane]}
                y2={yOf(t.row)}
                className={cn('eg-track', live && 'eg-track-live', walked.has(`${s.id}-${n}`) && 'eg-track-past')}
              />
            );
          }),
        )}
        {run.map.map((s) => {
          const { icon: Icon, label } = STATION[s.kind];
          const cx = LANE_X[s.lane];
          const cy = yOf(s.row);
          const can = next.has(s.id);
          return (
            <g
              key={s.id}
              className={cn(
                'eg-stn',
                `eg-stn-${s.kind}`,
                can && 'eg-stn-next',
                visited.has(s.id) && 'eg-stn-past',
                s.id === run.at && 'eg-stn-here',
              )}
              data-next={can ? '' : undefined}
              role={can ? 'button' : undefined}
              tabIndex={can ? 0 : undefined}
              aria-label={can ? `${label}, станция ${s.row}` : undefined}
              onClick={can ? () => go(s.id) : undefined}
              onKeyDown={can ? (e) => (e.key === 'Enter' || e.key === ' ') && go(s.id) : undefined}
            >
              <circle cx={cx} cy={cy} r={s.kind === 'boss' ? 17 : 13} />
              <Icon x={cx - 8} y={cy - 8} width={16} height={16} aria-hidden />
            </g>
          );
        })}
        {Array.from({ length: 10 }, (_, i) => (
          <text key={i} x={14} y={yOf(i + 1) + 4} className="eg-map-row">
            {i + 1}
          </text>
        ))}
      </svg>
      <div className="eg-map-go">
        <p className="muted">{here ? 'Куда дальше:' : 'Линия начинается. Первая станция:'}</p>
        <div className="eg-row">
          {[...next].map((id) => {
            const s = byId.get(id)!;
            const { icon: Icon, label } = STATION[s.kind];
            return (
              <Button key={id} variant="default" onClick={() => go(id)}>
                <Icon size={16} aria-hidden /> {label}
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
