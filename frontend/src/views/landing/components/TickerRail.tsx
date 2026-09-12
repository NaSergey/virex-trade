'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

const RAIL_KEYS = ['rail1', 'rail2', 'rail3', 'rail4', 'rail5', 'rail6'] as const;

/**
 * Лента терминов между первым экраном и рассказом.
 *
 * Это словарь продукта, пущенный строкой котировок: за две секунды видно, чем
 * здесь меряют торговлю, — без ещё одного абзаца текста. Полоса зажата между
 * двумя линейками и набрана моно, как всё служебное в системе.
 *
 * Два одинаковых прогона в дорожке и сдвиг ровно на половину её ширины —
 * поэтому шов цикла приходится на кадр, где второй прогон стоит точно там,
 * где стоял первый, и его не видно.
 *
 * `aria-hidden`: те же слова дальше по странице набраны в предложениях,
 * а скринридеру эта лента дала бы дважды повторённый список без связи.
 */
export function TickerRail() {
  const t = useTranslations('landing');
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const tween = useRef<gsap.core.Tween | null>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion() || !track.current) return;
      tween.current = gsap.to(track.current, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
    },
    { scope: root },
  );

  // Под курсором лента почти останавливается: слово, за которое зацепился
  // глаз, можно дочитать, а не догонять.
  const slowDown = () => {
    const tw = tween.current;
    if (tw) gsap.to(tw, { timeScale: 0.15, duration: 0.4 });
  };
  const speedUp = () => {
    const tw = tween.current;
    if (tw) gsap.to(tw, { timeScale: 1, duration: 0.4 });
  };

  return (
    <div className="ls-rail" ref={root} aria-hidden onMouseEnter={slowDown} onMouseLeave={speedUp}>
      <div className="ls-rail-track" ref={track}>
        {[0, 1].map((run) => (
          <div className="ls-rail-run" key={run}>
            {RAIL_KEYS.map((key) => (
              <span className="ls-rail-item" key={key}>
                {t(key)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
