'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import { Wrap } from '@/shared/ui/Wrap';
import { SceneHead } from './SceneHead';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { revealOnEnter } from '../lib/reveal';

/** Пункт и его экран: снимок настоящей страницы платформы (`public/assets/landing`). */
const STEPS = [
  { n: 1, shot: 'journal' },
  { n: 2, shot: 'tags' },
  { n: 3, shot: 'terminal' },
  { n: 4, shot: 'backtest' },
  { n: 5, shot: 'games' },
] as const;

/** Сколько пункт стоит, прежде чем выбор перейдёт к следующему. Та же длина — у полосы. */
const TOUR_MS = 7000;

/**
 * «Что внутри» — пять разделов платформы и их настоящие экраны.
 *
 * Подача — по лучшим продуктовым страницам (Mercury, TradeZella): показ
 * продукта, а не описание. Слева пять пунктов, раскрыт один — фраза о разделе;
 * справа большой экран этого раздела. Экраны — снимки страниц платформы на
 * демо-счёте (как снять заново — в CLAUDE.md, раздел главной), под ними это
 * сказано словами.
 *
 * Движение:
 *  - **Въезд** — экран поднимается из наклона в плоскость, пока секция
 *    въезжает (scrub): лежит «столом» и встаёт к зрителю.
 *  - **Смена** — экраны идут вертикальной лентой в такт списку слева: вниз по
 *    пунктам — новый выезжает снизу, прежний уходит вверх и гаснет; вверх по
 *    списку — наоборот (CSS: `.ls-shot`, направление — `--dir` у рамки).
 *    Приближения экрана нет — снято владельцем 2026-10-17. Шторка `clip-path` снизу стояла и снята
 *    владельцем 2026-10-17. Первый экран при загрузке не въезжает: анимация —
 *    только после первой смены (`data-moved`).
 *  - **Сама** — под активным пунктом бежит полоса; дошла — выбор переходит
 *    дальше. Конец полосы и есть таймер (`onAnimationEnd`), второго счётчика
 *    времени нет. Полоса стоит, пока секция не на экране и пока курсор над
 *    блоком; клик по пункту автосмену выключает — дальше выбирает человек.
 *
 * Сняты владельцем 2026-10-14 — не возвращать: липкий указатель с пятью
 * длинными абзацами, строки-ведомость, аккордеон из крупных названий, пять граф
 * текстом и переход «лист открывается слева направо».
 */
export function StepsScene() {
  const t = useTranslations('landing');
  const locale = useLocale() === 'en' ? 'en' : 'ru';
  const root = useRef<HTMLElement>(null);
  const tour = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [moved, setMoved] = useState(false);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const [hover, setHover] = useState(false);

  // Автосмена только на экране: за его краем полоса стоит, а не листает пункты
  // впустую. Уменьшенное движение автосмену снимает в CSS: у полосы нет
  // анимации — нет и её конца, который переключил бы пункт.
  useEffect(() => {
    const el = tour.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // `forward` — переход автосменой, в том числе с последнего пункта на первый:
  // лента идёт вниз и по кругу. Выбор рукой — по порядку пунктов.
  const show = (next: number, forward = false) => {
    if (next === active) return;
    setDir(forward || next > active ? 1 : -1);
    setMoved(true);
    setPrev(active);
    setActive(next);
  };

  useGSAP(
    () => {
      registerGsap();
      const el = root.current;
      if (!el || prefersReducedMotion()) return;

      gsap.fromTo(
        '.ls-tour-frame',
        { rotationX: 24, y: 90, scale: 0.9, opacity: 0.35, transformPerspective: 1400, transformOrigin: '50% 100%' },
        {
          rotationX: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          ease: 'power2.out',
          scrollTrigger: { trigger: '.ls-tour', start: 'top 95%', end: 'top 35%', scrub: 0.6 },
        },
      );
      revealOnEnter(gsap.utils.toArray<HTMLElement>('.ls-tour-item', el), {
        trigger: el.querySelector('.ls-tour'),
        start: 'top 75%',
        y: 18,
        stagger: 0.08,
      });
    },
    { scope: root },
  );

  const run = auto && inView && !hover;

  return (
    <section className="ls-steps" id="how" ref={root} aria-labelledby="how-title">
      <div className="ls-steps-in">
        <Wrap>
          <SceneHead kicker={t('stepsTitle')} kickerId="how-title" />
          <div
            className="ls-tour"
            ref={tour}
            data-run={run}
            data-auto={auto}
            style={{ '--tour-ms': `${TOUR_MS}ms` } as CSSProperties}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
          >
            <ol className="ls-tour-list" role="tablist" aria-orientation="vertical">
              {STEPS.map(({ n }, i) => {
                const on = i === active;
                return (
                  <li className={cn('ls-tour-item', on && 'on')} key={n}>
                    <Button
                      variant="none"
                      className="ls-tour-tab"
                      role="tab"
                      id={`how-tab-${n}`}
                      aria-selected={on}
                      aria-controls="how-screen"
                      onClick={() => {
                        setAuto(false);
                        show(i);
                      }}
                    >
                      <span className="ls-tour-n">{`0${n}`}</span>
                      <span className="ls-tour-t">{t(`step${n}Title`)}</span>
                    </Button>
                    <div className="ls-tour-body">
                      <p>{t(`step${n}Body`)}</p>
                    </div>
                    {on && (
                      <span
                        className="ls-tour-bar"
                        aria-hidden
                        onAnimationEnd={() => show((i + 1) % STEPS.length, true)}
                      />
                    )}
                  </li>
                );
              })}
            </ol>

            <figure className="ls-tour-stage">
              <div
                className="ls-tour-frame"
                id="how-screen"
                data-moved={moved}
                style={{ '--dir': dir } as CSSProperties}
                role="tabpanel"
                aria-labelledby={`how-tab-${STEPS[active].n}`}
              >
                {STEPS.map(({ n, shot }, i) => (
                  <div className={cn('ls-shot', i === active && 'on', i === prev && 'was')} key={shot}>
                    <Image
                      src={`/assets/landing/${shot}-${locale}-v4.webp`}
                      alt={i === active ? t(`step${n}Title`) : ''}
                      fill
                      sizes="(max-width: 1100px) 100vw, 62vw"
                    />
                  </div>
                ))}
              </div>
              <figcaption className="ls-tour-note">{t('stepsDemo')}</figcaption>
            </figure>
          </div>
        </Wrap>
      </div>
    </section>
  );
}
