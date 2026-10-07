'use client';

import { memo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { MarkAssembly } from './MarkAssembly';

/**
 * «Платформа» — первый экран: только знак, собираемый скроллом
 * (`MarkAssembly`), и подсказка «листайте». Текста на экране нет (решение
 * владельца 2026-10-07): о платформе рассказывает следующая секция, «Как это
 * работает». Заголовок страницы остаётся для скринридера и поисковика —
 * скрытым `h1`.
 *
 * Липкость — `position: sticky`, не пин ScrollTrigger (причины — в
 * `StepsScene`): высокая секция задаёт путь скролла, в ней стоит один экран.
 */
export const PlatformScene = memo(function PlatformScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const hint = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (!root.current || prefersReducedMotion()) return;
      gsap.to(hint.current, {
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=240', scrub: true },
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-plat" id="platform" ref={root} aria-labelledby="platform-title">
      <div className="ls-plat-stick">
        <Wrap className="ls-plat-wrap">
          <h1 className="ls-sr" id="platform-title">
            {t('platformTitle')}
          </h1>

          <MarkAssembly className="ls-plat-mark" />

          <span className="ls-plat-hint" ref={hint} aria-hidden>
            {t('scrollHint')}
          </span>
        </Wrap>
      </div>
    </section>
  );
});
