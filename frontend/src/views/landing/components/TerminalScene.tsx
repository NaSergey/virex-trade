'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { revealOnEnter } from '../lib/reveal';
import { TerminalDemo } from './TerminalDemo';

/**
 * «Терминал» — рассказ в две строки и сам терминал продукта на демо-счёте:
 * в нём можно открыть позицию, а наведение на любую часть объясняет, что она
 * делает. Терминал во всю ширину окна, как в продукте; текст — в колонке.
 */
export function TerminalScene() {
  const t = useTranslations('landing.term');
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion()) return;
      revealOnEnter(gsap.utils.toArray<HTMLElement>('.ls-term-copy > *', root.current ?? undefined), {
        trigger: root.current,
        start: 'top 72%',
        y: 20,
        stagger: 0.08,
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-term" id="terminal" ref={root}>
      <Wrap>
        <div className="ls-term-copy">
          <h2 className="ls-kicker">{t('kicker')}</h2>
          <p className="ls-term-title">{t('title')}</p>
          <p className="lp-lede">{t('lede')}</p>
        </div>
      </Wrap>
      <TerminalDemo />
    </section>
  );
}
