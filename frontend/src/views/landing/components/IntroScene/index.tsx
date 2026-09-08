'use client';

import { useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { registerGsap } from '../../lib/gsapConfig';
import { prefersReducedMotion } from '../../lib/reducedMotion';
import { VoidIntro } from './VoidIntro';
import { LogoAssemblyScene } from './LogoAssemblyScene';

/**
 * Сцены 00–02 одним операторским планом: пустота → сборка логотипа → (задача 6)
 * zoom и вспышка. Один компонент — один timeline: части логотипа и вспышка
 * обязаны знать конечное состояние друг друга кадр в кадр, и рвать это на
 * несколько независимых ScrollTrigger рискованно на реверсе.
 *
 * Три файла разметки (этот + VoidIntro + LogoAssemblyScene, и в задаче 6 —
 * LogoZoomFloodScene) — для читаемости; вся анимационная логика — здесь.
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
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: '+=3400',
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
        .addLabel('assembled', 'assembly+=1.9');

      // Задача 6 продолжает этот же timeline с метки 'assembled' (zoom + вспышка).
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
