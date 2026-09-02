'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { fmtUsdCompact } from './SentimentChart';
import { useLocaleControl } from '@/shared/i18n';
import { Skeleton } from '@/shared/ui/Skeleton';
import type { LiquidityPoint } from '../api/hooks';

const W = 900;
const PT = 22;
const PB = 22;
const MIN_PX = 170;
const MAX_PX = 260;
// Ссылка, стабильная между рендерами: `points ?? []` создавала бы новый
// пустой массив каждый раз, когда данных ещё нет, и useMemo ниже пересчитывал
// бы график заново на каждый рендер зря.
const EMPTY: LiquidityPoint[] = [];

/**
 * Цена и «центр тяжести» книги заявок во времени: средневзвешенная по объёму
 * цена бид- и аск-стороны (топ-200 уровней), рядом с самой ценой. Не сам
 * стакан — тот только «сейчас»; здесь три линии одного масштаба ($), и
 * расхождение бид/аск-центра от цены — это и есть перекос ликвидности,
 * который раньше в этом месте пытался показать сначала стакан-лесенка, потом
 * доли лонг/шорт-аккаунтов. Ни то, ни другое не было тем графиком, который
 * просили, — этот собран по присланному образцу.
 *
 * История начинается не раньше запуска `LiquiditySnapshotService`: биржи не
 * архивируют прошлые состояния стакана, бэкфилл невозможен в принципе.
 * Поэтому у компонента, помимо обычных «грузится»/«есть график», есть третье
 * состояние — «только начали копить»: одна точка без линии, но с числом,
 * чтобы страница не выглядела пустой, только потому что ряду ещё нет и часа.
 */
export function LiquidityCenterChart({
  points,
  isLoading,
  height = 200,
}: {
  points?: LiquidityPoint[];
  isLoading?: boolean;
  height?: number;
}) {
  const t = useTranslations('market');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const boxRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const u = boxW > 0 ? W / boxW : 1;
  const vbHeight = useMemo(() => {
    if (boxW <= 0) return height;
    const px = Math.min(MAX_PX, Math.max(MIN_PX, (boxW * height) / W));
    return Math.round((px * W) / boxW);
  }, [boxW, height]);
  const pt = PT * u;
  const pb = PB * u;

  const data = points ?? EMPTY;

  const chart = useMemo(() => {
    if (data.length < 2) return null;
    const all = data.flatMap((p) => [p.price, p.bidCenter, p.askCenter]);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || Math.max(1, lo * 0.001);
    const y0 = lo - pad;
    const y1 = hi + pad;
    const x = (i: number) => (i / (data.length - 1)) * W;
    const y = (v: number) => pt + (1 - (v - y0) / (y1 - y0)) * (vbHeight - pt - pb);
    const line = (key: 'price' | 'bidCenter' | 'askCenter') =>
      data.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    return { x, y, priceLine: line('price'), bidLine: line('bidCenter'), askLine: line('askCenter') };
  }, [data, vbHeight, pt, pb]);

  const legend = (
    <div className="ckey">
      <span>
        <i style={{ background: 'var(--ink)' }} />
        {t('liquidityPriceLabel')}
      </span>
      <span>
        <i style={{ background: 'var(--color-up)' }} />
        {t('liquidityBidCenterLabel')}
      </span>
      <span>
        <i style={{ background: 'var(--color-down)' }} />
        {t('liquidityAskCenterLabel')}
      </span>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {legend}
        <LiquidityCenterChartSkeleton height={height} />
      </>
    );
  }

  if (data.length === 0) {
    return (
      <>
        {legend}
        <p className="muted">{t('liquidityEmpty')}</p>
      </>
    );
  }

  // Одна точка: линию рисовать не из чего, но число уже есть — молчать о нём
  // значило бы прятать единственный факт, который на этот час известен.
  if (!chart) {
    const p = data[data.length - 1];
    return (
      <>
        {legend}
        <p className="muted">
          {t('liquidityStarting', {
            date: new Date(p.ts).toLocaleString(intlLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
            price: fmtUsdCompact(p.price, locale),
            bid: fmtUsdCompact(p.bidCenter, locale),
            ask: fmtUsdCompact(p.askCenter, locale),
          })}
        </p>
      </>
    );
  }

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))));
  };

  // Не hoverIdx напрямую: ряд под курсором меняется (смена инструмента), а
  // индекс наведения переживает смену и указывает в точку, которой в новом
  // ряду уже нет. Проверяем на каждом проходе, а не только в onMove.
  const idx = hoverIdx != null && hoverIdx < data.length ? hoverIdx : null;
  const hover = idx != null ? data[idx] : null;
  const hx = idx != null ? chart.x(idx) : 0;

  const last = data[data.length - 1];
  const lx = chart.x(data.length - 1);
  const endLabels: Array<[number, string]> = [
    [last.price, 'var(--ink)'],
    [last.bidCenter, 'var(--color-up)'],
    [last.askCenter, 'var(--color-down)'],
  ];

  return (
    <div ref={boxRef} onPointerMove={onMove} onPointerLeave={() => setHoverIdx(null)}>
      {legend}
      <svg
        viewBox={`0 0 ${W} ${vbHeight}`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
        role="img"
        aria-label={t('liquidityAriaLabel')}
      >
        <polyline points={chart.bidLine} fill="none" stroke="var(--color-up)" strokeWidth={(1.5 * u).toFixed(2)} strokeLinejoin="round" />
        <polyline points={chart.askLine} fill="none" stroke="var(--color-down)" strokeWidth={(1.5 * u).toFixed(2)} strokeLinejoin="round" />
        <polyline points={chart.priceLine} fill="none" stroke="var(--ink)" strokeWidth={(1.4 * u).toFixed(2)} strokeLinejoin="round" opacity="0.85" />

        {/* Прямые подписи на конце ряда — цвет тот же, что у линии, значение
            видно без наведения. */}
        {endLabels.map(([v, color], i) => (
          <text
            key={i}
            x={(lx + 6 * u).toFixed(1)}
            y={(chart.y(v) + 3.5 * u).toFixed(1)}
            fill={color}
            fontSize={(10.5 * u).toFixed(1)}
            fontFamily="var(--font-mono)"
          >
            {fmtUsdCompact(v, locale)}
          </text>
        ))}

        {hover && (
          <g>
            <line
              x1={hx.toFixed(1)}
              y1={(pt - 8 * u).toFixed(1)}
              x2={hx.toFixed(1)}
              y2={(vbHeight - pb + 8 * u).toFixed(1)}
              stroke="var(--color-line-strong)"
              strokeWidth={u.toFixed(2)}
              shapeRendering="crispEdges"
            />
            <text
              x={(hx > W * 0.62 ? hx - 8 * u : hx + 8 * u).toFixed(1)}
              y={(pt - 3 * u).toFixed(1)}
              textAnchor={hx > W * 0.62 ? 'end' : 'start'}
              fill="var(--color-fg)"
              fontSize={(11 * u).toFixed(1)}
              fontFamily="var(--font-mono)"
            >
              {t('liquidityHoverLabel', {
                date: new Date(hover.ts).toLocaleString(intlLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                price: fmtUsdCompact(hover.price, locale),
                bid: fmtUsdCompact(hover.bidCenter, locale),
                ask: fmtUsdCompact(hover.askCenter, locale),
              })}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/**
 * Место графика, пока история не пришла. Ключ настоящий (рисует вызывающий
 * компонент — три линии известны заранее), холст — заглушка на месте, где
 * будет либо линия, либо строка «копим первую точку».
 */
function LiquidityCenterChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div style={{ position: 'relative' }} aria-hidden>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ display: 'block', width: '100%', height: 'auto', visibility: 'hidden' }} />
      <div style={{ position: 'absolute', inset: 0 }}>
        <Skeleton as="span" flush height="100%" className="skel-canvas" />
      </div>
    </div>
  );
}
