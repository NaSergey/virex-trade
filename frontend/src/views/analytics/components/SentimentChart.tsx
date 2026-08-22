'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { SentimentPoint } from '../api/hooks';
import { useLocaleControl, type Locale } from '@/shared/i18n';

const W = 900;
const PT = 18;
const PB = 22;

/**
 * В каких пределах холст стоит на экране. Пропорция 900:180 задана под ширину
 * основной колонки; на телефоне те же 180 единиц оборачивались полосой в
 * семьдесят пикселей, и кривая доли лонгов читалась как дрожание линии.
 */
const MIN_PX = 150;
const MAX_PX = 260;

/** $6.1B / $840M — компактные доллары для подписи. */
export function fmtUsdCompact(v: number, locale: Locale = 'ru'): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)} M`;
  return `$${Math.round(v).toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU')}`;
}

/**
 * Позиционирование участников: доля лонг-аккаунтов во времени. Волосяная линия
 * на 50% — «толпа нейтральна»; всё, что выше, — перевес в лонг.
 *
 * Открытый интерес намеренно не наложен второй кривой со своей шкалой: две
 * несопоставимые оси на одном полотне создают ложные «пересечения», которых в
 * данных нет. Его текущее значение стоит числом в коэффициентах выше.
 */
export function SentimentChart({ data, height = 180 }: { data: SentimentPoint[]; height?: number }) {
  const t = useTranslations('analytics');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const boxRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [boxW, setBoxW] = useState(0);

  // Холст масштабируется целиком, вместе с подписями: на узкой колонке одна
  // единица viewBox — это треть пикселя, и кегль, заданный в единицах, на
  // экране втрое мельче объявленного (на телефоне — четыре пикселя, читать
  // нечем). Меряем ширину и пересчитываем кегль в экранные пиксели, как это
  // делает кривая P&L.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Сколько единиц холста приходится на один экранный пиксель. */
  const u = boxW > 0 ? W / boxW : 1;

  // Высота viewBox — от измеренной ширины, чтобы холст на экране не выходил
  // из MIN_PX…MAX_PX. На широкой колонке счёт возвращает объявленное.
  const vbHeight = useMemo(() => {
    if (boxW <= 0) return height;
    const px = Math.min(MAX_PX, Math.max(MIN_PX, (boxW * height) / W));
    return Math.round((px * W) / boxW);
  }, [boxW, height]);

  // Поля холста растут вместе с кеглем: сверху в них стоит подпись наведения,
  // и объявленных восемнадцати единиц ей хватало ровно при кегле в единицах
  // же. Подпись, пересчитанная в экранные пиксели, в такое поле не влезала и
  // обрезалась верхним краем холста.
  const pt = PT * u;
  const pb = PB * u;

  const chart = useMemo(() => {
    if (data.length < 2) return null;
    const values = data.map((p) => p.buyRatio * 100);
    // Домен всегда включает 50: без этого нейтральная линия могла бы уехать за
    // край и перевес читался бы не от чего.
    const lo = Math.min(45, ...values) - 1;
    const hi = Math.max(55, ...values) + 1;
    const x = (i: number) => (i / (values.length - 1)) * W;
    const y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (vbHeight - pt - pb);
    return {
      x,
      y,
      values,
      line: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      neutralY: y(50),
    };
  }, [data, vbHeight, pt, pb]);

  if (!chart) return <p className="muted">{t('noDataForPeriod')}</p>;

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))));
  };

  // Не hoverIdx напрямую: ряд под курсором меняется (смена периода или
  // символа), а индекс наведения переживает смену и указывает в точку, которой
  // в новом ряду уже нет. Проверяем на каждом проходе, а не только в onMove.
  const idx = hoverIdx != null && hoverIdx < data.length ? hoverIdx : null;
  const hover = idx != null ? { point: data[idx], value: chart.values[idx] } : null;
  const hx = idx != null ? chart.x(idx) : 0;

  return (
    <div ref={boxRef} onPointerMove={onMove} onPointerLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${W} ${vbHeight}`} style={{ display: 'block', width: '100%', height: 'auto' }} role="img" aria-label={t('longShareAriaLabel')}>
        <line
          x1="0"
          y1={chart.neutralY.toFixed(1)}
          x2={W}
          y2={chart.neutralY.toFixed(1)}
          stroke="var(--color-line-2)"
          strokeWidth={u.toFixed(2)}
          strokeDasharray={`${(3 * u).toFixed(1)} ${(4 * u).toFixed(1)}`}
        />
        <text
          x="0"
          y={(chart.neutralY - 6 * u).toFixed(1)}
          fill="var(--color-subtle)"
          fontSize={(11 * u).toFixed(1)}
          fontFamily="var(--font-mono)"
        >
          {t('neutralLabel')}
        </text>
        {/* Толщина линий — тоже в единицах холста: на телефоне полуторная
            обращалась в шесть десятых пикселя, и кривая выцветала. */}
        <polyline
          points={chart.line}
          fill="none"
          stroke="var(--color-fg)"
          strokeWidth={(1.5 * u).toFixed(2)}
          strokeLinejoin="round"
        />

        {hover && (
          <g>
            <line
              x1={hx.toFixed(1)}
              y1={(pt - 10 * u).toFixed(1)}
              x2={hx.toFixed(1)}
              y2={(vbHeight - pb + 10 * u).toFixed(1)}
              stroke="var(--color-line-strong)"
              strokeWidth={u.toFixed(2)}
              shapeRendering="crispEdges"
            />
            <text
              x={(hx > W * 0.7 ? hx - 8 * u : hx + 8 * u).toFixed(1)}
              y={(pt - 2 * u).toFixed(1)}
              textAnchor={hx > W * 0.7 ? 'end' : 'start'}
              fill="var(--color-fg)"
              fontSize={(12 * u).toFixed(1)}
              fontFamily="var(--font-mono)"
            >
              {t('hoverLabel', {
                value: hover.value.toFixed(1),
                date: new Date(hover.point.timestamp).toLocaleString(intlLocale, {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
              {hover.point.openInterestUsd > 0
                ? t('oiSuffix', { oi: fmtUsdCompact(hover.point.openInterestUsd, locale) })
                : ''}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
