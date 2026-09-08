'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/** Сцена 03: обещание продукта — построчный clip-path reveal на светлой палитре. */
export function PromiseScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const ledeRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion()) return;

      gsap.set([titleRef.current, ledeRef.current], { clipPath: 'inset(0 0 100% 0)' });

      gsap
        .timeline({
          scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'top 20%', scrub: 1 },
        })
        .to(titleRef.current, { clipPath: 'inset(0 0 0% 0)', duration: 1, ease: 'power2.out' })
        .to(ledeRef.current, { clipPath: 'inset(0 0 0% 0)', duration: 1, ease: 'power2.out' }, '<0.2');
    },
    { scope: root },
  );

  return (
    <section className="ls-promise ls-light" ref={root} id="promise-scene" tabIndex={-1}>
      <Wrap>
        <h1 ref={titleRef}>{t('heroTitle')}</h1>
        <p className="lp-lede" ref={ledeRef}>
          {t('heroLede')}
        </p>
      </Wrap>
    </section>
  );
}
