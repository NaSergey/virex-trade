'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Button } from '@/shared/ui/Button';
import { VirexLogo } from '@/shared/ui/VirexLogo';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { candlesFromCenter } from '../lib/reveal';
import { useMagnetic } from '../lib/useMagnetic';
import { SplitWords } from './SplitWords';

/**
 * Первый экран.
 *
 * Здесь стоит главное решение нового лендинга: обещание, знак и кнопка
 * попадают в первый кадр целиком, без прокрутки. Прежняя главная открывалась
 * пустотой и собирала знак на протяжении пяти тысяч пикселей скролла — на
 * такую вводную соглашается тот, кто уже решил остаться, а решают это как раз
 * в первые секунды. Кино осталось, но оно теперь идёт по загрузке страницы, а
 * не по скроллу, и стоит зрителю ноль его усилий.
 *
 * Единственное, что здесь тянет скролл, — параллакс знака: он уезжает
 * медленнее текста и тем отдаёт странице глубину, ничего не пряча.
 */
export function HeroScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLSpanElement>(null);
  const cueRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLSpanElement>(null);

  useMagnetic(ctaRef);

  useGSAP(
    () => {
      registerGsap();
      const words = gsap.utils.toArray<HTMLElement>('.ls-word-in', titleRef.current ?? undefined);
      const fades = gsap.utils.toArray<HTMLElement>('.ls-fade', root.current ?? undefined);
      const candles = candlesFromCenter(markRef.current);
      gsap.set(candles, { transformOrigin: '50% 50%' });

      if (prefersReducedMotion()) {
        gsap.set([...words, ...fades], { opacity: 1, y: 0, yPercent: 0 });
        gsap.set(candles, { opacity: 1, scaleY: 1 });
        gsap.set(scanRef.current, { opacity: 0 });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      // Свечи печатаются из центра наружу — так же, как знак читается глазом:
      // от главной свечи к боковым.
      tl.from(candles, { scaleY: 0, opacity: 0, duration: 0.9, stagger: 0.09 }, 0.05)
        .from(words, { yPercent: 115, duration: 1, stagger: 0.05 }, 0.15)
        .from(fades, { opacity: 0, y: 14, duration: 0.8, stagger: 0.1 }, 0.5)
        // Дальше знак не замирает, а дышит: свечи чуть тянутся и оседают,
        // вразнобой — единственное непрерывное движение на странице, и оно
        // держится под порогом, за которым начинает мешать читать.
        .to(
          candles,
          { scaleY: 1.06, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.22, from: 'center' } },
          '>-0.2',
        );

      // Сетка листа тянется вверх ровно на свой шаг (48px, см. landing.css) —
      // на стыке кадр в кадр совпадает сама с собой, поэтому цикл не заметен.
      gsap.to(gridRef.current, { y: -48, duration: 14, ease: 'none', repeat: -1 });
      gsap.to(markRef.current, { y: -12, duration: 7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      gsap.fromTo(
        scanRef.current,
        { top: '10%' },
        { top: '90%', duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 },
      );
      gsap.fromTo(
        cueRef.current,
        { y: -14, opacity: 0 },
        { y: 30, opacity: 1, duration: 1.5, ease: 'power1.inOut', repeat: -1, repeatDelay: 0.3 },
      );

      // Параллакс: знак отстаёт от текста на треть пути первого экрана.
      // `yPercent` — отдельная от `y` часть трансформации, поэтому не спорит
      // с дрейфом выше: GSAP складывает их в одну матрицу, а не переписывает.
      gsap.to(markRef.current, {
        yPercent: -14,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-hero" ref={root}>
      <div className="ls-hero-grid" ref={gridRef} aria-hidden />

      <Wrap className="ls-hero-wrap">
        <div className="ls-hero-copy">
          <p className="ls-eyebrow ls-fade">{t('eyebrow')}</p>
          <h1 className="ls-hero-title" ref={titleRef}>
            <SplitWords text={t('heroTitle')} />
          </h1>
          <p className="lp-lede ls-fade">{t('heroLede')}</p>
          <div className="lp-cta ls-fade">
            <span className="ls-magnet" ref={ctaRef}>
              <Link href="/login?mode=register">
                <Button variant="solid">{t('ctaStart')}</Button>
              </Link>
            </span>
            <Link href="/login" className="lp-login">
              {t('signIn')}
            </Link>
          </div>
          <p className="lp-note ls-fade">{t('ctaNote')}</p>
        </div>

        <div className="ls-hero-mark" ref={markRef} aria-hidden>
          <VirexLogo />
          {/* Линия уровня, медленно идущая по знаку: тот же приём, что и в
              продукте, где горизонталь означает цену, а не украшение. */}
          <span className="ls-scanline" ref={scanRef} />
        </div>
      </Wrap>

      <div className="ls-hero-cue ls-fade" aria-hidden>
        <span className="ls-cue-word">{t('scrollHint')}</span>
        <span className="ls-cue-rail">
          <i ref={cueRef} />
        </span>
      </div>
    </section>
  );
}
