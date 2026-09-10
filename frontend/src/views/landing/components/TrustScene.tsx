'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { revealOnEnter } from '../lib/reveal';

const HONEST_KEYS = ['honest1', 'honest2', 'honest3'] as const;

/**
 * Права ключей и честный список того, чего в продукте пока нет.
 *
 * Оговорки набраны нумерованными строками гроссбуха, а не мелким шрифтом под
 * абзацем: их вес в рассказе тот же, что у обещаний, и оформление обязано это
 * показывать. Движение здесь самое тихое на странице — блок с признанием
 * «живые сделки видел один Bybit» не должен выглядеть эффектным.
 */
export function TrustScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion()) return;

      revealOnEnter(gsap.utils.toArray<HTMLElement>('.ls-trust-line', root.current ?? undefined), {
        trigger: root.current,
        start: 'top 78%',
        y: 18,
        stagger: 0.09,
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-trust" ref={root}>
      <Wrap>
        <div className="ls-trust-grid">
          <div className="ls-trust-block">
            <h2 className="ls-kicker ls-trust-line">{t('keysTitle')}</h2>
            <p className="lp-body ls-trust-line">{t('keysBody')}</p>
          </div>

          <div className="ls-trust-block">
            <h2 className="ls-kicker ls-trust-line">{t('honestTitle')}</h2>
            <ul className="lp-honest">
              {HONEST_KEYS.map((key, i) => (
                <li className="ls-trust-line" key={key}>
                  <span className="ls-honest-n">{`0${i + 1}`}</span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Wrap>
    </section>
  );
}
