'use client';

import { memo, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { EDGES, GLINTS, H, SHARDS, STOPS, W, pts } from '@/shared/ui/tradePlayMarkGeometry';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/** Предел разъезда букв в единицах рисунка; на узком экране он меньше — см. `flyOf`. */
const FLY_MAX = 140;

/**
 * Центр между буквами на старте: x — середина просвета между ножками «T» и «P»,
 * y — середина знака. Просвет — от правой кромки ножки «T» (x ≈ 102 на высоте
 * текста) до левой ножки «P» (x ≈ 122), и каждая из букв разъезжается на `fly`.
 */
const TITLE_X = 112;
const TITLE_Y = 71;
const GAP_BASE = 20;

/** Поле у края экрана, за которое буква на старте не выходит, px. */
const EDGE_GAP = 28;

/** Крайние x осколков: левая кромка «T» и правая «P». */
const T_LEFT = Math.min(...SHARDS.filter((s) => s.id.startsWith('t-')).flatMap((s) => s.outline.map(([x]) => x)));
const P_RIGHT = Math.max(...SHARDS.filter((s) => s.id.startsWith('p-')).flatMap((s) => s.outline.map(([x]) => x)));

/** Момент таймлайна, к которому парение букв стихает. */
const IDLE_END = 1.2;

/** Парение букв: размах в единицах рисунка и период, с. Буквы — навстречу друг другу. */
const FLOAT = [
  { dx: 9, dy: -5, period: 5.2 },
  { dx: -9, dy: 5, period: 6.4 },
] as const;

/** Буквы знака: осколки левой «T» и правой «P». Каждая собирается и едет своей группой. */
const LETTERS = [
  { side: 'l', shards: SHARDS.filter((s) => s.id.startsWith('t-')) },
  { side: 'r', shards: SHARDS.filter((s) => s.id.startsWith('p-')) },
] as const;

/** Грани всех осколков одним списком; своя группа — по `shard`. */
const FACETS = SHARDS.flatMap(({ id, facets }) =>
  facets.map(([a, b, c, tone], i) => ({
    key: `${id}-${i}`,
    shard: id,
    a,
    b,
    c,
    tone,
  })),
);

/** Искры делятся между буквами по x: те, что левее зазора, — у «T», остальные — у «P». */
const GLINTS_OF = {
  l: GLINTS.filter(([x]) => x < 130),
  r: GLINTS.filter(([x]) => x >= 130),
} as const;

/**
 * Знак Trade Play, собираемый скроллом, — отдельный рисунок, а не
 * `TradePlayMark` с флажками: у сборки свои слои, которых у знака в шапке нет
 * (проход блика, разъезд букв). Геометрия общая — `tradePlayMarkGeometry`.
 *
 * **Первый экран не пуст:** «T» и «P» стоят разведёнными по краям — силуэтами-каркасом
 * (контур и грани линиями, без заливки) — и тихо парят навстречу друг другу.
 * Буквы на старте целиком в экране: разъезд считается по тому, как знак вписан
 * (`flyOf`). Пустой экран никого не звал листать (владелец
 * 2026-10-13); подсказкой это не лечится — интересно должно быть то, что
 * видно. Скролл сводит буквы — вот и вся механика:
 *
 *   0. вступление (по времени, не по скроллу) — буквы проявляются, кромки
 *      прорисовываются; дальше буквы парят;
 *   1. скролл: парение стихает, буквы едут к центру и обрастают стеклом —
 *      заливка наливается, линии каркаса гаснут;
 *   2. в просвете между буквами — надпись: она уменьшается вместе с ним и гаснет,
 *      не дожидаясь, пока буквы сойдутся;
 *   3. на стыке по стеклу проходит блик, вспыхивают искры.
 *
 * Парение — Web Animations по `translate` с готовым размахом в пикселях:
 * такую анимацию видеокарта ведёт сама, без единого кадра работы потока (CSS с
 * `var()` в ключевых кадрах шёл через поток — пересчёт стилей каждый кадр).
 * Первые шаги прокрутки сводят размах к нулю (`setIdle` → `setKeyframes`, фаза
 * не сбивается), на нуле анимация снимается. Парит внутренняя группа
 * (`.mk-float`), а едет внешняя: GSAP читает `translate` своего элемента и
 * сложил бы своё движение с чужим.
 *
 * **Начальное состояние задаёт CSS, а не JS** (`landing.css`, блок
 * `.mk`): разметка приходит с сервера уже со скрытыми слоями, и до гидрации
 * не мелькает собранный знак, который GSAP тут же спрятал бы. Кромки
 * прячутся пунктиром длиной в контур (`pathLength="1"`), и рисует их сдвиг
 * пунктира — без плагина и без замеров длины.
 *
 * Секция ищется через `closest`, а не берётся рефом от родителя: эффект
 * ребёнка срабатывает раньше, чем React привяжет реф предка, и таймлайн
 * оставался бы без триггера.
 *
 * **Слои, а не один SVG** (оптимизация 2026-10-13, откатывать нельзя). Буква —
 * HTML-слой, внутри — свои SVG на каждую часть: стекло, сетка граней, контур,
 * искры; надпись — свой SVG. Все в одном viewBox и одной рамке, поэтому
 * рисунок сходится точь-в-точь. Разъезд букв (`x` у `.mk-letter`), парение
 * (`translate` у `.mk-float`) и проявление/угасание частей (`opacity` у их
 * SVG) двигают готовые картинки на видеокарте. Одним SVG знак
 * перерастрировался на каждом кадре: в покое, пока буквы парят, — ~1100 мс
 * работы потока в секунду при ЦП ×4, то есть поток был занят целиком (замер
 * трассой 2026-10-13). Перерисовываются теперь только вступление (кромки
 * рисуются пунктиром), блик и вспышка искр — на своих коротких отрезках.
 *
 * Разъезд и размах парения — в пикселях экрана (`unit` — пикселей в единице
 * рисунка): HTML-слою единицы viewBox неизвестны.
 *
 * `memo`: сборка не зависит ни от чего на странице, и перерисовка родителя
 * (смена вкладки в шапке) не должна трогать полсотни узлов SVG.
 */
export const MarkAssembly = memo(function MarkAssembly({ className }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const t = useTranslations('landing');

  useGSAP(
    () => {
      registerGsap();
      const box = root.current;
      const section = box?.closest('section');
      // Мерить — по пустому слою-линейке: он не двигается, и его CTM — чистое
      // вписывание viewBox в рамку.
      const ruler = box?.querySelector<SVGSVGElement>('.mk-ruler');
      if (!box || !section || !ruler || prefersReducedMotion()) return;

      const q = (sel: string) => gsap.utils.toArray<SVGElement>(sel, box);
      const left = box.querySelector('.mk-letter-l');
      const right = box.querySelector('.mk-letter-r');
      const bodies = q('.mk-body');
      const title = box.querySelector<SVGGElement>('.mk-title');
      const titleLayer = box.querySelector<HTMLElement>('.mk-title-wrap');
      const outlines = q('.mk-outline');
      const outlineLayers = q('.mk-outlines');
      const wires = q('.mk-wire');
      const wireLayers = q('.mk-wires');
      const edges = q('.mk-edge');
      const sweep = box.querySelector('.mk-sweep-grad');
      const sweepRects = q('.mk-sweep');
      const glints = q('.mk-glint');
      const glintK = glints.map((g) => Number(g.dataset.k ?? 1));
      /** Пикселей экрана в единице рисунка. */
      const unit = () => ruler.getScreenCTM()?.a ?? 1;

      // Парение: размах `k` от 1 (покой) до 0 (стоит). Ключевые кадры
      // переписываются только при смене размаха — то есть на первых шагах
      // прокрутки, а в покое анимацию ведёт видеокарта.
      const floats = gsap.utils.toArray<HTMLElement>('.mk-float', box);
      let anims: Animation[] = [];
      let idle = -1;
      const frames = (i: number, k: number) => {
        const u = unit() * k;
        const ease = 'ease-in-out';
        return [
          { translate: '0px 0px', easing: ease },
          {
            translate: `${FLOAT[i].dx * u}px ${FLOAT[i].dy * u}px`,
            easing: ease,
          },
          { translate: '0px 0px' },
        ];
      };
      const setIdle = (k: number, force = false) => {
        if (!force && Math.abs(k - idle) < 0.02 && k > 0 === idle > 0) return;
        idle = k;
        if (k <= 0) {
          anims.forEach((a) => a.cancel());
          anims = [];
        } else if (anims.length === 0) {
          anims = floats.map((el, i) =>
            el.animate(frames(i, k), {
              duration: FLOAT[i].period * 1000,
              iterations: Infinity,
            }),
          );
        } else {
          anims.forEach((a, i) => (a.effect as KeyframeEffect).setKeyframes(frames(i, k)));
        }
      };
      setIdle(1);

      gsap.set(glints, { scale: 0.2, transformOrigin: '50% 50%' });

      // Насколько можно развести буквы, чтобы обе целиком стояли в экране: от
      // собранного положения до поля у края. Считается по тому, как знак
      // вписан сейчас, и пересчитывается на каждом `refresh` (смена окна).
      const flyOf = () => {
        const m = ruler.getScreenCTM();
        if (!m) return 0;
        const room = Math.min(
          (m.a * T_LEFT + m.e - EDGE_GAP) / m.a,
          (window.innerWidth - EDGE_GAP - (m.a * P_RIGHT + m.e)) / m.a,
        );
        return Math.max(0, Math.min(FLY_MAX, room));
      };

      // Точка надписи в рамке, px: от неё слой надписи и уменьшается.
      const titleOrigin = () => {
        const m = ruler.getScreenCTM();
        const r = box.getBoundingClientRect();
        return m ? `${m.a * TITLE_X + m.e - r.left}px ${m.d * TITLE_Y + m.f - r.top}px` : '50% 50%';
      };

      // Надпись вписывается в просвет между буквами на старте и в нём же стоит,
      // пока он не схлопнулся.
      const titleScale = () => {
        const w = title?.getBBox().width ?? 0;
        return w > 0 ? Math.min(1, (GAP_BASE + 2 * flyOf() - 12) / w) : 1;
      };

      const intro = gsap.timeline({ delay: 0.15 });
      intro
        .to(
          outlines,
          {
            strokeDashoffset: 0,
            duration: 1.1,
            stagger: 0.15,
            ease: 'power2.inOut',
          },
          0,
        )
        .to(title, { opacity: 1, duration: 1, ease: 'power1.inOut' }, 0.4)
        .to(
          wires,
          {
            strokeDashoffset: 0,
            duration: 0.8,
            stagger: 0.02,
            ease: 'power1.out',
          },
          0.5,
        )
        .to(
          edges,
          {
            strokeDashoffset: 0,
            duration: 0.9,
            stagger: 0.02,
            ease: 'power2.out',
          },
          0.5,
        );

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.8,
          invalidateOnRefresh: true,
          // Начали листать (или страница открылась уже прокрученной) — вступление
          // доигрывается сразу, иначе оно проявило бы кромки поверх сборки.
          onUpdate: (self) => {
            if (self.progress > 0.01 && intro.progress() < 1) intro.progress(1);
          },
          // Размах парения — в пикселях, и окно сменилось — пересчитать.
          onRefresh: () => setIdle(idle, true),
        },
        onUpdate: () => setIdle(Math.max(0, 1 - tl.time() / IDLE_END)),
      });

      tl
        // 1 · буквы едут навстречу (в пикселях: буква — HTML-слой)
        .fromTo(left, { x: () => -flyOf() * unit() }, { x: 0, duration: 4.2, ease: 'power2.out' }, 0.2)
        .fromTo(right, { x: () => flyOf() * unit() }, { x: 0, duration: 4.2, ease: 'power2.out' }, 0.2)
        // надпись уменьшается вместе с просветом и гаснет раньше, чем буквы к ней
        // подойдут. Уменьшается и гаснет HTML-блок вокруг её SVG, а не группа
        // внутри и не сам `<svg>`: и то и другое перекладывало текст SVG на
        // каждом кадре.
        .fromTo(
          titleLayer,
          { scale: () => titleScale(), transformOrigin: () => titleOrigin() },
          {
            scale: () => titleScale() * 0.1,
            duration: 4.2,
            ease: 'power2.out',
          },
          0.2,
        )
        // Гаснет слой, а проявляет вступление — группу внутри: два твина на
        // одном свойстве одного узла дрались, и страница, открытая уже ниже
        // (якорь, восстановленная прокрутка), рисовала конец таймлайна раньше, чем
        // отыгрывало вступление, — надпись то оставалась на собранном знаке, то
        // пропадала при возврате наверх.
        .to(titleLayer, { opacity: 0, duration: 1.5 }, 0.2)
        // каркас обрастает стеклом по пути: стекло наливается, линии гаснут —
        // целыми слоями, а не по узлам
        .to(bodies, { opacity: 1, duration: 3.2 }, 0.8)
        .to(wireLayers, { opacity: 0, duration: 1.2 }, 3)
        .to(outlineLayers, { opacity: 0, duration: 1.4 }, 3.4)
        // 2 · стык: блик и вспышка искр. Блик рисуется только на своём
        // отрезке: наложение `screen` на весь знак — больше половины растра
        // каждого кадра, даже когда полоса стоит за краем знака.
        .set(sweepRects, { display: 'inline' }, 4.4)
        .fromTo(
          sweep,
          { attr: { x1: -90, x2: -20 } },
          {
            attr: { x1: W + 40, x2: W + 110 },
            duration: 1.6,
            ease: 'power1.inOut',
          },
          4.4,
        )
        .set(sweepRects, { display: 'none' }, 6)
        .to(
          glints,
          {
            opacity: (i: number) => glintK[i],
            scale: 1.7,
            duration: 0.3,
            stagger: 0.08,
            ease: 'power2.out',
          },
          4.6,
        )
        .to(glints, { scale: 1, duration: 0.6, stagger: 0.08, ease: 'back.out(3)' }, 4.9)
        // Хвост: знак стоит собранным, пока скролл доезжает до конца секции.
        .to({}, { duration: 1 }, 6.2);

      return () => anims.forEach((a) => a.cancel());
    },
    { scope: root },
  );

  const vb = `-30 -14 ${W + 60} ${H + 28}`;
  const layer = (cls: string, children: ReactNode) => (
    <svg className={`mk-layer ${cls}`} viewBox={vb} overflow="visible" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  );

  return (
    <div ref={root} className={['mk', className].filter(Boolean).join(' ')} aria-hidden>
      <svg className="mk-defs" width="0" height="0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mk-sheen" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
            {STOPS.map((offset, i) => (
              <stop key={offset} offset={offset} style={{ stopColor: `var(--tpm-${i + 1})` }} />
            ))}
          </linearGradient>
          {/* Блик: узкая полоса под курсивом знака, едущая слева направо. Одна на
              обе буквы — координаты у слоёв общие, и полоса проходит их без шва. */}
          <linearGradient
            id="mk-sweep"
            className="mk-sweep-grad"
            gradientUnits="userSpaceOnUse"
            x1={W + 40}
            y1="0"
            x2={W + 110}
            y2="0"
            gradientTransform="skewX(-23)"
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          {LETTERS.map(({ side, shards }) => (
            <clipPath key={side} id={`mk-clip-${side}`}>
              {shards.map(({ id, outline }) => (
                <polygon key={id} points={pts(outline)} />
              ))}
            </clipPath>
          ))}
          <radialGradient id="mk-glint">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.25" stopColor="#fff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      {layer('mk-ruler', null)}
      <div className="mk-title-wrap">
        {layer(
          'mk-title-layer',
          <g className="mk-title">
            <g className="mk-title-in">
              <text x={TITLE_X} y={TITLE_Y - 3} textAnchor="middle">
                {t('heroTitleA')}
              </text>
              <text x={TITLE_X} y={TITLE_Y + 14} textAnchor="middle">
                {t('heroTitleB')}
              </text>
            </g>
          </g>,
        )}
      </div>

      {LETTERS.map(({ side, shards }) => {
        const ids = shards.map((sh) => sh.id);
        const facets = FACETS.filter((f) => ids.includes(f.shard));
        return (
          <div key={side} className={`mk-letter mk-letter-${side}`}>
            <div className="mk-float">
              {layer(
                'mk-body',
                <>
                  {shards.map(({ id, outline }) => (
                    <polygon key={id} points={pts(outline)} fill="url(#mk-sheen)" />
                  ))}
                  {facets.map(({ key, a, b, c, tone }) => (
                    <polygon
                      key={key}
                      points={pts([a, b, c])}
                      fill={tone > 0 ? '#fff' : '#000'}
                      fillOpacity={Math.abs(tone)}
                    />
                  ))}
                  {/* кромки */}
                  <g className="mk-edges">
                    {EDGES.filter((e) => ids.some((id) => e.key.startsWith(`${id}-`))).map(({ key, a, b, opacity }) => (
                      <line
                        key={key}
                        className="mk-edge mk-line"
                        x1={a[0]}
                        y1={a[1]}
                        x2={b[0]}
                        y2={b[1]}
                        strokeOpacity={opacity}
                        pathLength={1}
                      />
                    ))}
                  </g>
                  {/* блик — по осколкам своей буквы */}
                  <rect
                    className="mk-sweep"
                    clipPath={`url(#mk-clip-${side})`}
                    x={-40}
                    y={-10}
                    width={W + 80}
                    height={H + 20}
                    fill="url(#mk-sweep)"
                  />
                </>,
              )}
              {layer(
                'mk-wires',
                facets.map(({ key, a, b, c }) => (
                  <polygon key={key} className="mk-wire mk-line" points={pts([a, b, c])} pathLength={1} />
                )),
              )}
              {layer(
                'mk-outlines',
                shards.map(({ id, outline }) => (
                  <polygon key={id} className="mk-outline mk-line" points={pts(outline)} pathLength={1} />
                )),
              )}
              {layer(
                'mk-glints',
                GLINTS_OF[side].map(([x, y, k]) => (
                  <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
                    <g className="mk-glint" data-k={k} opacity={k}>
                      <circle r="9" fill="url(#mk-glint)" />
                      <ellipse rx="26" ry="1.1" fill="url(#mk-glint)" />
                      <ellipse rx="1" ry="12" fill="url(#mk-glint)" />
                    </g>
                  </g>
                )),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
