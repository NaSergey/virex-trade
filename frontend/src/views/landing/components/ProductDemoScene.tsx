'use client';

import { useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { MetricCell } from '@/shared/ui/MetricCell';
import { Money } from '@/shared/ui/Money';
import { Tag } from '@/entities/tag';
// Импорт из model/geometry напрямую, а не из '@/widgets/equity-chart' — тот
// барrel-файл реэкспортирует ещё и сам React-компонент EquityChart со своими
// зависимостями (next-intl, ui/layers), которые лендингу не нужны и незачем
// тащить в бандл ради одной чистой функции геометрии.
import { buildEquityGeometry, W, type EquityGeometry } from '@/widgets/equity-chart/model/geometry';
import type { EquityPoint } from '@/entities/trade';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { isMobileViewport } from '../lib/breakpoints';

const CURVE_HEIGHT = 220;

/** Длина пина сцены: сколько скролла занимает вся демонстрация панели. */
const PIN_LENGTH_DESKTOP = 2600;
/** На телефоне путь вдвое короче — двигается то же самое и оттуда же. */
const PIN_LENGTH_MOBILE = 1300;

type Translate = (key: string) => string;

/** Иллюстративная кривая — с реалистичной просадкой, не идеальная прямая. */
const DEMO_EQUITY: EquityPoint[] = [
  { time: 0, value: 0 },
  { time: 1, value: 340 },
  { time: 2, value: 210 },
  { time: 3, value: 480 },
  { time: 4, value: 260 },
  { time: 5, value: 690 },
  { time: 6, value: 980 },
  { time: 7, value: 860 },
  { time: 8, value: 1240 },
];

/** Имена тегов — витринные, но всё же слова, а не термины: идут через переводы. */
const DEMO_TRADES = [
  { symbol: 'BTCUSDT', dir: 'long' as const, pnl: 128.4, tagKey: 'demoTag1', color: '#5b78a3' },
  { symbol: 'ETHUSDT', dir: 'short' as const, pnl: -42.1, tagKey: 'demoTag2', color: '#8a5ba3' },
];

type DemoMetric = {
  key: string;
  /**
   * Подпись метрики. Функция, а не строка и не ключ: «Edge Score» —
   * собственное имя метрики продукта, одинаковое в обеих локалях (как
   * 'Long'/'Short' в аналитике), а винрейт и профит-фактор — обычные слова, и
   * им нужен перевод. Так оба случая живут в одном поле без ветвлений в JSX.
   */
  label: (t: Translate) => string;
  target: number;
  format: (v: number) => string;
};

const METRICS: DemoMetric[] = [
  { key: 'edge', label: () => 'Edge Score', target: 61, format: (v) => Math.round(v).toString() },
  { key: 'winrate', label: (t) => t('demoWinrateLabel'), target: 57.4, format: (v) => `${v.toFixed(1)} %` },
  { key: 'pf', label: (t) => t('demoPfLabel'), target: 1.9, format: (v) => v.toFixed(2) },
];

const SECTIONS = ['overview', 'tags', 'analytics', 'market'] as const;

export function ProductDemoScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const metricRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const curveRef = useRef<SVGPolylineElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const captionRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const geometry = useMemo<EquityGeometry | null>(() => buildEquityGeometry(DEMO_EQUITY, CURVE_HEIGHT), []);

  useGSAP(
    () => {
      registerGsap();
      const curve = curveRef.current;
      const metricsEls = metricRefs.current.filter((el): el is HTMLSpanElement => el != null);
      const rows = rowRefs.current.filter((el): el is HTMLTableRowElement => el != null);
      const captions = captionRefs.current.filter((el): el is HTMLParagraphElement => el != null);
      if (!curve || metricsEls.length === 0) return;

      const length = curve.getTotalLength();
      gsap.set(curve, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set(rows, { opacity: 0, y: 16 });
      gsap.set(captions, { opacity: 0 });
      gsap.set(captions[0] ?? null, { opacity: 1 });

      if (prefersReducedMotion()) {
        gsap.set(curve, { strokeDashoffset: 0 });
        gsap.set(rows, { opacity: 1, y: 0 });
        gsap.set(captions, { opacity: 1 });
        metricsEls.forEach((el, i) => {
          el.textContent = METRICS[i].format(METRICS[i].target);
        });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          // Функция, а не строка — ScrollTrigger зовёт её на каждом refresh;
          // подробности выбора против `gsap.matchMedia()` — в IntroScene.
          end: () => `+=${isMobileViewport() ? PIN_LENGTH_MOBILE : PIN_LENGTH_DESKTOP}`,
          scrub: 1,
          pin: true,
        },
      });

      tl.addLabel('metrics', 0);
      METRICS.forEach((m, i) => {
        const el = metricsEls[i];
        if (!el) return;
        const counter = { v: 0 };
        tl.to(
          counter,
          {
            v: m.target,
            duration: 1,
            ease: 'power1.out',
            onUpdate: () => {
              el.textContent = m.format(counter.v);
            },
          },
          `metrics+=${i * 0.15}`,
        );
      });

      tl.addLabel('curve', 'metrics+=0.6')
        .to(curve, { strokeDashoffset: 0, duration: 1.6, ease: 'power1.inOut' }, 'curve')
        .addLabel('ledger', 'curve+=0.9')
        .to(rows, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.25 }, 'ledger');

      // Подписи разделов сменяются по числу секций, синхронно с тем, что сейчас
      // «главное» на панели: metrics+curve → overview, ledger → tags, дальше —
      // аналитика и рынок как продолжение того же ритма.
      captions.forEach((caption, i) => {
        if (i === 0) return;
        tl.to(captions[i - 1], { opacity: 0, duration: 0.3 }, `metrics+=${0.9 * i}`).to(
          caption,
          { opacity: 1, duration: 0.3 },
          `metrics+=${0.9 * i}`,
        );
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-demo ls-light" ref={root}>
      <Wrap>
        <div className="ls-demo-panel">
          <div className="metrics metrics-3">
            {METRICS.map((m, i) => (
              <MetricCell
                key={m.key}
                label={m.label(t)}
                value={
                  <span ref={(el) => { metricRefs.current[i] = el; }}>
                    {m.format(0)}
                  </span>
                }
              />
            ))}
          </div>

          {geometry && (
            <svg
              className="ls-demo-curve"
              viewBox={`0 0 ${W} ${CURVE_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <polyline ref={curveRef} points={geometry.line} fill="none" stroke="var(--ink)" strokeWidth={2} />
            </svg>
          )}

          <div className="scroll">
            <table className="ledger ls-demo-ledger">
              <tbody>
                {DEMO_TRADES.map((row, i) => (
                  <tr key={row.symbol} ref={(el) => { rowRefs.current[i] = el; }}>
                    <td className="sym">{row.symbol}</td>
                    <td>
                      {/* 'Long'/'Short' совпадают в обеих локалях и в продукте
                          не переводятся (ср. DIR_LABELS в аналитике и
                          TradesTable, где направление печатается как есть). */}
                      <span className={row.dir === 'short' ? 'dir short' : 'dir'}>
                        {row.dir === 'short' ? 'Short' : 'Long'}
                      </span>
                    </td>
                    <td>
                      <Tag name={t(row.tagKey)} color={row.color} />
                    </td>
                    <td className="r">
                      <Money value={row.pnl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ls-demo-captions">
          {SECTIONS.map((id, i) => (
            <p className="ls-demo-caption" key={id} ref={(el) => { captionRefs.current[i] = el; }}>
              <strong>{t(`section_${id}_title`)}</strong> — {t(`section_${id}_body`)}
            </p>
          ))}
        </div>
      </Wrap>
    </section>
  );
}
