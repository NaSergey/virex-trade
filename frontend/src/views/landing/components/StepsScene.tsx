'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

const STEPS = [1, 2, 3] as const;

/** Сцена 04: три шага «как это работает» — раскрываются по одному, не разом. */
export function StepsScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      registerGsap();
      const items = listRef.current ? gsap.utils.toArray<HTMLLIElement>('.ls-step', listRef.current) : [];
      if (items.length === 0) return;

      if (prefersReducedMotion()) {
        gsap.set(items, { opacity: 1, y: 0 });
        return;
      }

      gsap.set(items, { opacity: 0, y: 48 });
      gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=1600', scrub: 1, pin: true },
      }).to(items, { opacity: 1, y: 0, duration: 1, ease: 'power2.out', stagger: 0.5 });
    },
    { scope: root },
  );

  return (
    <section className="ls-steps ls-light" ref={root}>
      <Wrap>
        <h2>{t('stepsTitle')}</h2>
        <ol className="lp-steps" ref={listRef}>
          {STEPS.map((n) => (
            <li className="lp-step ls-step" key={n}>
              <h3>{t(`step${n}Title`)}</h3>
              <p>{t(`step${n}Body`)}</p>
            </li>
          ))}
        </ol>
      </Wrap>
    </section>
  );
}
