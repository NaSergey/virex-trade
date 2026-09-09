'use client';

import { useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { registerGsap } from '../../lib/gsapConfig';
import { prefersReducedMotion } from '../../lib/reducedMotion';
import { isMobileViewport } from '../../lib/breakpoints';
import { VoidIntro } from './VoidIntro';
import { LogoAssemblyScene } from './LogoAssemblyScene';

/** Длина пина: сколько скролла занимает весь план от пустоты до вспышки. */
const PIN_LENGTH_DESKTOP = 5200;
/**
 * На телефоне та же дистанция — это больше десятка экранов прокрутки ради
 * одной сборки знака: страница читается как зависшая. Двигаются те же
 * элементы и оттуда же, короче только путь.
 */
const PIN_LENGTH_MOBILE = 2700;

/**
 * Сцены 00–02 одним операторским планом: пустота → сборка логотипа → zoom и
 * вспышка. Один компонент — один timeline: части логотипа и вспышка обязаны
 * знать конечное состояние друг друга кадр в кадр, и рвать это на несколько
 * независимых ScrollTrigger рискованно на реверсе.
 *
 * Сцена 02 (zoom и вспышка) своей разметки не имеет вовсе — это transform
 * уже собранного знака и opacity общей подложки SceneBackground, — поэтому
 * отдельного файла у неё нет.
 *
 * Два файла разметки (VoidIntro + LogoAssemblyScene) — для читаемости; вся
 * анимационная логика — здесь.
 */
export function IntroScene({ lightLayerRef }: { lightLayerRef: RefObject<HTMLDivElement | null> }) {
  const root = useRef<HTMLElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();
      const logo = logoRef.current;
      if (!logo) return;
      gsap.set(logo, { transformOrigin: '50% 50%' });

      const candle = (id: string) => logo.querySelector<SVGPathElement>(`[data-candle="${id}"]`);
      const left = candle('left');
      const leftCenter = candle('left-center');
      const center = candle('center');
      const rightCenter = candle('right-center');
      const right = candle('right');
      if (!left || !leftCenter || !center || !rightCenter || !right) return;

      if (prefersReducedMotion()) {
        gsap.set([wordRef.current, hintRef.current], { opacity: 0 });
        gsap.set([left, leftCenter, center, rightCenter, right], { opacity: 1, x: 0, y: 0 });
        // Масштаб не трогаем: знак остаётся собранным в натуральную величину,
        // а не замороженным посреди zoom'а. Подложку не трогаем тоже — в этом
        // режиме фон каждой сцене красит CSS (см. landing.css).
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          // Функция, а не строка: ScrollTrigger зовёт её заново на каждом
          // refresh, поэтому поворот экрана меняет длину пина без пересборки
          // таймлайна. `gsap.matchMedia()` сделал бы то же самое, но через
          // снос и пересборку — а от неё разъезжаются границы соседних
          // ScrollTrigger'ов, созданных вне matchMedia (кроссфейд финала).
          end: () => `+=${isMobileViewport() ? PIN_LENGTH_MOBILE : PIN_LENGTH_DESKTOP}`,
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });

      // x/y ниже — в локальных единицах viewBox знака (0–100, см. VirexLogo), не
      // в пикселях: цель твина — сам <path>, а не что-то на странице, и GSAP
      // считает смещение в системе координат SVG. 100 единиц — это примерно вся
      // высота знака, поэтому офсеты в 70–100 уже уверенно уводят свечу за
      // пределы его собственной рамки, а не на миллиметр от неё.
      tl.to([wordRef.current, hintRef.current], { opacity: 0, y: -16, duration: 0.4, ease: 'power1.out' }, 0)
        .addLabel('assembly', 0.4)
        // крайние — сверху, с лёгкой диагональю
        .fromTo(left, { x: -14, y: -70, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 1.4, ease: 'power3.out' }, 'assembly')
        .fromTo(right, { x: 14, y: -70, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 1.4, ease: 'power3.out' }, 'assembly')
        // средние — снизу
        .fromTo(leftCenter, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.3, ease: 'power3.out' }, 'assembly+=0.15')
        .fromTo(rightCenter, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.3, ease: 'power3.out' }, 'assembly+=0.15')
        // центральная — последней, строго сверху, довершает знак
        .fromTo(center, { y: -100, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out' }, 'assembly+=0.4')
        .addLabel('assembled', 'assembly+=1.9')
        // zoom: знак «летит на зрителя», части уходят за края экрана.
        // Множитель вдвое меньше, чем при прежнем, вдвое более скромном
        // размере знака в состоянии покоя (min(46svh,74vw) → min(90svh,92vw))
        // — конечный, уже забивающий собой весь кадр размер и темп самого
        // zoom’а остаются теми же, что уже проверены и работают.
        .to(logo, { scale: 13, duration: 2.2, ease: 'power2.in' }, 'assembled+=0.1');

      // Вспышка: белый слой перекрывает весь экран к концу zoom.
      // `fromTo`, а не `to`: `to` берёт начальное значение из DOM в момент
      // сборки таймлайна, и после разрывного прыжка скролла оно уже чужое.
      // С явными числовыми концами значение слоя — чистая функция прогресса
      // этого ScrollTrigger'а (GSAP зажимает его в 0 до начала и в 1 после
      // конца), а не истории записей в DOM.
      if (lightLayerRef.current) {
        tl.fromTo(
          lightLayerRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 1.4, ease: 'power1.inOut' },
          'assembled+=1.1',
        );
      }

      // короткая пауза на пике белого — визуальный вдох перед контентом
      tl.to({}, { duration: 0.5 }, 'assembled+=2.6');
    },
    { scope: root },
  );

  return (
    <section className="ls-intro ls-dark" ref={root}>
      <VoidIntro wordRef={wordRef} hintRef={hintRef} />
      <LogoAssemblyScene groupRef={logoRef} />
    </section>
  );
}
