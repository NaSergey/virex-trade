'use client';

import { useRef, type RefObject } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Button } from '@/shared/ui/Button';
import { VirexLogo } from '@/shared/ui/VirexLogo';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/**
 * Сцена 07: финал. Возвращает фон к тёмной палитре (та же, что в остальном
 * продукте) и показывает знак статично, без повторной сборки — это payoff
 * истории, а не ещё одна демонстрация того же трюка.
 */
export function FinaleScene({ lightLayerRef }: { lightLayerRef: RefObject<HTMLDivElement | null> }) {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();

      if (prefersReducedMotion()) {
        if (lightLayerRef.current) gsap.set(lightLayerRef.current, { opacity: 0 });
        return;
      }

      const content = contentRef.current ? gsap.utils.toArray<HTMLElement>('.ls-finale-item', contentRef.current) : [];
      gsap.set(content, { opacity: 0, y: 16 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top 90%', end: 'top 30%', scrub: 1 },
      });

      if (lightLayerRef.current) {
        tl.to(lightLayerRef.current, { opacity: 0, duration: 1, ease: 'power1.inOut' }, 0);
      }
      tl.to(content, { opacity: 1, y: 0, duration: 1, ease: 'power2.out', stagger: 0.25 }, 0.2);
    },
    { scope: root },
  );

  return (
    <section className="ls-finale ls-dark" ref={root}>
      <Wrap>
        <div ref={contentRef}>
          <VirexLogo className="ls-finale-logo ls-finale-item" aria-hidden />
          <h2 className="ls-finale-item">{t('endTitle')}</h2>
          <p className="lp-body ls-finale-item">{t('endBody')}</p>
          <div className="lp-cta ls-finale-item">
            <Link href="/login?mode=register">
              <Button variant="solid">{t('ctaStart')}</Button>
            </Link>
            <span className="lp-note">{t('ctaNote')}</span>
          </div>
          <Link href="/login" className="lp-login ls-finale-item">
            {t('signIn')}
          </Link>
        </div>
      </Wrap>
    </section>
  );
}
