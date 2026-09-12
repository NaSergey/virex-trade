'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/shared/lib/utils/css';
import { Wrap } from '@/shared/ui/Wrap';
import { MetricCell } from '@/shared/ui/MetricCell';
import { Money } from '@/shared/ui/Money';
import { Tag } from '@/entities/tag';
// Импорт из model/geometry напрямую, а не из '@/widgets/equity-chart' — тот
// barrel-файл реэкспортирует ещё и сам React-компонент EquityChart со своими
// зависимостями (next-intl, ui/layers), которые лендингу не нужны и незачем
// тащить в бандл ради одной чистой функции геометрии.
import { buildEquityGeometry, W, type EquityGeometry } from '@/widgets/equity-chart/model/geometry';
import type { EquityPoint } from '@/entities/trade';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/* Кривая рисуется во всю ширину панели с `preserveAspectRatio: none`, поэтому
   высота здесь — это пропорция, а не пиксели: при 200 на ширине viewBox в 1000
   линия вытягивалась в почти прямую и переставала показывать просадку, ради
   которой она тут и стоит. */
const CURVE_HEIGHT = 300;

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
  { symbol: 'SOLUSDT', dir: 'long' as const, pnl: 61.8, tagKey: 'demoTag1', color: '#5b78a3' },
];

type DemoMetric = {
  key: string;
  /**
   * Подпись метрики. Функция, а не строка и не ключ: «Edge Score» —
   * собственное имя метрики продукта, одинаковое в обеих локалях (как
   * Long/Short в аналитике), а винрейт и профит-фактор — обычные слова, и им
   * нужен перевод. Так оба случая живут в одном поле без ветвлений в JSX.
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

/**
 * «Что внутри» — единственная вывернутая в светлое полоса на странице.
 *
 * Инверсия здесь не смена настроения, а тот самый способ выделения, который
 * принят во всём продукте: активное — это выворотная плашка. Раздел, где
 * показывают сам продукт, и есть активная часть рассказа, поэтому светлеет
 * ровно он, жёсткой границей по линейке, а не переходом.
 *
 * Панель липкая, разделы читаются рядом с ней и по очереди её перенастраивают:
 * названный раздел на панели проявляется, остальное приглушается. Это дешевле
 * четырёх скриншотов и честнее их — числа собраны теми же компонентами, что и
 * в приложении, а не нарисованы.
 */
export function ProductDemoScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const metricRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const curveRef = useRef<SVGPolylineElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const [active, setActive] = useState(0);

  const geometry = useMemo<EquityGeometry | null>(() => buildEquityGeometry(DEMO_EQUITY, CURVE_HEIGHT), []);

  useGSAP(
    () => {
      registerGsap();
      const curve = curveRef.current;
      const metricsEls = metricRefs.current.filter((el): el is HTMLSpanElement => el != null);
      const rows = rowRefs.current.filter((el): el is HTMLTableRowElement => el != null);
      const items = gsap.utils.toArray<HTMLElement>('.ls-demo-item', root.current ?? undefined);
      if (!curve || metricsEls.length === 0) return;

      // Переключение раздела — навигация по панели, а не эффект: работает и
      // в режиме уменьшенного движения, где всё остальное сразу собрано.
      items.forEach((item, i) => {
        ScrollTrigger.create({
          trigger: item,
          start: 'top 64%',
          end: 'bottom 64%',
          onToggle: (self) => {
            if (self.isActive) setActive(i);
          },
        });
      });

      if (prefersReducedMotion()) {
        gsap.set(curve, { strokeDashoffset: 0 });
        gsap.set(rows, { opacity: 1, y: 0 });
        metricsEls.forEach((el, i) => {
          el.textContent = METRICS[i].format(METRICS[i].target);
        });
        return;
      }

      const length = curve.getTotalLength();
      gsap.set(curve, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set(rows, { opacity: 0, y: 14 });

      // Панель оживает один раз, когда доехала до экрана: числа набегают,
      // кривая прочерчивается, строки журнала встают одна за другой. Дальше
      // она остаётся собранной — разбирать её обратно на прокрутке вверх
      // значило бы показывать пустое приложение тому, кто уже видел полное.
      const tl = gsap.timeline({ scrollTrigger: { trigger: panelRef.current, start: 'top 78%', once: true } });

      METRICS.forEach((m, i) => {
        const el = metricsEls[i];
        if (!el) return;
        const counter = { v: 0 };
        tl.to(
          counter,
          {
            v: m.target,
            duration: 1.1,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = m.format(counter.v);
            },
          },
          i * 0.12,
        );
      });

      tl.to(curve, { strokeDashoffset: 0, duration: 1.6, ease: 'power1.inOut' }, 0.35).to(
        rows,
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.12 },
        1.3,
      );
    },
    { scope: root },
  );

  return (
    <section className="ls-demo ls-light" ref={root}>
      <Wrap className="ls-demo-wrap">
        <h2 className="ls-kicker">{t('sectionsTitle')}</h2>

        <div className="ls-demo-cols">
          <div className="ls-demo-sticky">
            <div className="ls-panel" data-focus={SECTIONS[active]} ref={panelRef}>
              <div className="ls-panel-head">
                <span className="ls-panel-brand">Virex</span>
                <span className="ls-panel-where">{t(`section_${SECTIONS[active]}_title`)}</span>
              </div>

              <div className="metrics metrics-3 ls-panel-part" data-part="metrics">
                {METRICS.map((m, i) => (
                  <MetricCell
                    key={m.key}
                    label={m.label(t)}
                    value={
                      <span
                        ref={(el) => {
                          metricRefs.current[i] = el;
                        }}
                      >
                        {m.format(0)}
                      </span>
                    }
                  />
                ))}
              </div>

              {geometry && (
                <svg
                  className="ls-panel-curve ls-panel-part"
                  data-part="curve"
                  viewBox={`0 0 ${W} ${CURVE_HEIGHT}`}
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <polyline ref={curveRef} points={geometry.line} fill="none" stroke="var(--ink)" strokeWidth={2} />
                </svg>
              )}

              <div className="scroll ls-panel-part" data-part="ledger">
                <table className="ledger ls-panel-ledger">
                  <tbody>
                    {DEMO_TRADES.map((row, i) => (
                      <tr
                        key={row.symbol}
                        ref={(el) => {
                          rowRefs.current[i] = el;
                        }}
                      >
                        <td className="sym">{row.symbol}</td>
                        <td>
                          {/* Long/Short совпадают в обеих локалях и в продукте не
                              переводятся (ср. DIR_LABELS в аналитике и
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

            <p className="ls-panel-note">{t('panelNote')}</p>
          </div>

          <ol className="ls-demo-list">
            {SECTIONS.map((id, i) => (
              <li className={cn('ls-demo-item', i === active && 'on')} key={id}>
                <h3>
                  <span className="ls-demo-n">{`0${i + 1}`}</span>
                  {t(`section_${id}_title`)}
                </h3>
                <p>{t(`section_${id}_body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </Wrap>
    </section>
  );
}
