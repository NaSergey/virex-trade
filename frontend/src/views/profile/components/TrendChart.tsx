'use client';

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useLocaleControl } from '@/shared/i18n';
import { linePoints, pathOf } from '../lib/charts';
import { int } from '../lib/format';
import { Panel } from './Panel';

/** Наименьшая высота холста; обычно высоту даёт панель. */
const MIN_H = 120;
const PAD = 6;

const fmtDay = (day: string, locale: string) =>
  new Date(`${day}T00:00:00Z`)
    .toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');

/**
 * Линия ряда по дням с крупным числом над ней — «Опыт» и «Монеты» профиля.
 * Краска — тон панели (`tone`), а не цвет прибыли. Холст лежит в блоке
 * абсолютно и берёт его высоту: иначе высота холста и блока гнали бы друг
 * друга по кругу.
 */
export function TrendChart({
  title,
  tone,
  value,
  sub,
  series,
  unit,
}: {
  title: ReactNode;
  tone: 'violet' | 'gold';
  value: ReactNode;
  sub: ReactNode;
  series: { day: string; v: number }[];
  unit?: ReactNode;
}) {
  const { locale } = useLocaleControl();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(MIN_H);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setW(Math.round(entry.contentRect.width));
      setH(Math.max(MIN_H, Math.round(entry.contentRect.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = useMemo(() => (w > 0 ? linePoints(series.map((p) => p.v), w, h, PAD) : []), [series, w, h]);
  const line = pathOf(pts);
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x.toFixed(1)} ${h} L${pts[0].x.toFixed(1)} ${h} Z` : '';
  const last = pts[pts.length - 1];
  const at = hover != null ? pts[hover] : null;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (pts.length === 0) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const step = pts.length > 1 ? pts[1].x - pts[0].x : 1;
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round((x - PAD) / step))));
  };

  return (
    <Panel title={title} tone={tone}>
      <div className="pf-trend-head">
        <span className="pf-trend-v n">{value}</span>
        <span className="pf-trend-sub n">{sub}</span>
      </div>
      <div className="pf-trend">
        <div className="pf-trend-box" ref={box}>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(w, 1)} ${h}`}
            preserveAspectRatio="none"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            aria-hidden
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="pf-trend-g0" />
                <stop offset="1" className="pf-trend-g1" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill={`url(#${gid})`} />}
            {line && <path d={line} className="pf-trend-line" />}
            {last && !at && <circle className="pf-trend-dot is-live" cx={last.x} cy={last.y} r={4} />}
            {at && (
              <>
                <line className="pf-trend-cursor" x1={at.x} x2={at.x} y1={0} y2={h} />
                <circle className="pf-trend-dot" cx={at.x} cy={at.y} r={4} />
              </>
            )}
          </svg>
        </div>
        {at && hover != null && (
          <div
            className="pf-trend-tip n"
            style={{ left: at.x, translate: at.x > w * 0.6 ? 'calc(-100% - 10px) 0' : '10px 0' }}
          >
            <span className="muted">{fmtDay(series[hover].day, locale)}</span> {int(series[hover].v)} {unit}
          </div>
        )}
        {series.length > 1 && (
          <div className="pf-trend-axis n" aria-hidden>
            <span>{fmtDay(series[0].day, locale)}</span>
            <span>{fmtDay(series[series.length - 1].day, locale)}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}
