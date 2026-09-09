'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

const HONEST_KEYS = ['honest1', 'honest2', 'honest3'] as const;

/** Сцена 06: read-only ключи + честность про непроверенные биржи — тихий reveal. */
export function TrustScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion()) return;

      const blocks = blocksRef.current ? gsap.utils.toArray<HTMLElement>('.ls-trust-block', blocksRef.current) : [];
      if (blocks.length === 0) return;

      gsap.set(blocks, { opacity: 0, y: 20 });
      gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top 75%', end: 'top 25%', scrub: 1 },
      }).to(blocks, { opacity: 1, y: 0, duration: 1, ease: 'power1.out', stagger: 0.3 });
    },
    { scope: root },
  );

  return (
    <section className="ls-trust ls-light" ref={root}>
      <Wrap>
        <div ref={blocksRef}>
          <div className="ls-trust-block">
            <h2>{t('keysTitle')}</h2>
            <p className="lp-body">{t('keysBody')}</p>
          </div>

          <div className="ls-trust-block">
            <h2>{t('honestTitle')}</h2>
            <ul className="lp-honest">
              {HONEST_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        </div>
      </Wrap>
    </section>
  );
}
