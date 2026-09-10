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
import { candlesFromCenter, revealOnEnter } from '../lib/reveal';
import { useMagnetic } from '../lib/useMagnetic';

/**
 * Финал: знак печатается второй и последний раз, под ним — единственное
 * действие страницы.
 *
 * Повтор сборки здесь намеренный и он же единственный: первый экран показал
 * знак живым, финал возвращает тот же жест как подпись под рассказом. Между
 * ними знака нет вовсе — иначе приём перестаёт что-либо значить.
 */
export function FinaleScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLSpanElement>(null);

  useMagnetic(ctaRef);

  useGSAP(
    () => {
      registerGsap();
      const candles = candlesFromCenter(markRef.current);
      const lines = gsap.utils.toArray<HTMLElement>('.ls-finale-line', root.current ?? undefined);
      gsap.set(candles, { transformOrigin: '50% 50%' });

      if (prefersReducedMotion()) return;

      gsap.fromTo(
        candles,
        { scaleY: 0, opacity: 0 },
        {
          scaleY: 1,
          opacity: 1,
          duration: 0.85,
          stagger: 0.08,
          ease: 'power3.out',
          scrollTrigger: { trigger: root.current, start: 'top 72%', once: true },
        },
      );

      revealOnEnter(lines, { trigger: root.current, start: 'top 70%', y: 20, stagger: 0.1 });
    },
    { scope: root },
  );

  return (
    <section className="ls-finale" ref={root}>
      <Wrap>
        <div className="ls-finale-mark" ref={markRef} aria-hidden>
          <VirexLogo />
        </div>
        <h2 className="ls-finale-line">{t('endTitle')}</h2>
        <p className="lp-body ls-finale-line">{t('endBody')}</p>
        <div className="lp-cta ls-finale-line">
          <span className="ls-magnet" ref={ctaRef}>
            <Link href="/login?mode=register">
              <Button variant="solid">{t('ctaStart')}</Button>
            </Link>
          </span>
          <span className="lp-note">{t('ctaNote')}</span>
        </div>
        <Link href="/login" className="lp-login ls-finale-line">
          {t('signIn')}
        </Link>
      </Wrap>
    </section>
  );
}
