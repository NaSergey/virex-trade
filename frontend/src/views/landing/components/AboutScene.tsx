'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { cn } from '@/shared/lib/utils/css';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { revealOnEnter } from '../lib/reveal';
import { ROADMAP } from '../lib/roadmap';
import { SceneHead } from './SceneHead';

/** Где дорога идёт сверху вниз, а этапы — друг под другом. Та же граница — в `landing.css`. */
const VERTICAL = '(max-width: 720px)';
/** Отрезок дороги одного этапа — в единицах таймлайна. */
const SEG = 1;

/**
 * «О проекте» — дорожная карта платформы на один экран: что уже работает и
 * что будет, этапами слева направо. «В планах» разложено по сложности
 * разработки (`lib/roadmap.ts`). Спека —
 * `docs/superpowers/specs/2026-10-13-landing-roadmap-design.md`.
 *
 * Переход — свой: **дорога прокладывается**. Пока секция въезжает на экран,
 * дорога прорисовывается отрезок за отрезком: на станции этапа появляется
 * ромб с подписью, вехи выпадают под ней по очереди. Бейджа «Сейчас» на стыке
 * запущенного и планов нет — снят владельцем 2026-10-17. Привязано к скроллу въезда: когда секция встала, карта
 * собрана, лишнего скролла нет. Шапка поднимается построчно чуть раньше.
 *
 * Отрезок дороги — у каждого этапа свой, от его станции до следующей: так
 * стык «сплошная — пунктир» стоит ровно на станции второго этапа и в строку, и в
 * столбик, без замеров. Направление выбирается на монтировании, а не
 * `gsap.matchMedia` (причина — `breakpoints.ts`).
 *
 * **Начальное состояние — в CSS** (`.ls-rm` в `landing.css`): до гидрации
 * собранная карта не мелькает.
 */
export function AboutScene() {
  const t = useTranslations('landing.about');
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      registerGsap();
      const el = root.current;
      if (!el || prefersReducedMotion()) return;

      revealOnEnter(Array.from(el.querySelector('.ls-head')?.children ?? []), {
        trigger: el,
        start: 'top 80%',
        y: 22,
        stagger: 0.08,
      });

      const vertical = window.matchMedia(VERTICAL).matches;
      const axis = vertical ? 'scaleY' : 'scaleX';
      const board = el.querySelector('.ls-rm');
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: vertical
          ? { trigger: board, start: 'top 85%', end: 'bottom 70%', scrub: 0.6 }
          : { trigger: board, start: 'top 92%', end: 'top 35%', scrub: 0.6 },
      });

      gsap.utils.toArray<HTMLElement>('.ls-rm-phase', el).forEach((phase, k) => {
        const at = k * SEG;
        tl.fromTo(phase.querySelector('.ls-rm-seg'), { [axis]: 0 }, { [axis]: 1, duration: SEG }, at)
          // Поворот ромба — в самом твине: GSAP вбирает CSS-свойство `rotate` в
          // свой `transform` и сбрасывает его, и без этого станция встала бы квадратом.
          .fromTo(
            phase.querySelector('.ls-rm-node'),
            { scale: 0, rotation: 45 },
            { scale: 1, rotation: 45, duration: 0.25, ease: 'back.out(3)' },
            at,
          )
          .fromTo(phase.querySelector('.ls-rm-label'), { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.05)
          .fromTo(
            phase.querySelectorAll('.ls-rm-item'),
            { opacity: 0, y: -10 },
            { opacity: 1, y: 0, duration: 0.4, stagger: 0.12, ease: 'power2.out' },
            at + 0.15,
          );
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-about" id="about" ref={root} aria-labelledby="about-title">
      <div className="ls-about-in">
        <Wrap className="ls-about-wrap">
          <SceneHead kicker={t('kicker')} title={t('title')} titleId="about-title" />

          <ol className="ls-rm">
            {ROADMAP.map(({ id, items }) => (
              <li key={id} className={cn('ls-rm-phase', id === 'live' ? 'done' : 'plan')}>
                <span className="ls-rm-seg" aria-hidden />
                <span className="ls-rm-node" aria-hidden />
                <h3 className="ls-rm-label">{t(`phases.${id}`)}</h3>
                <ul className="ls-rm-items">
                  {items.map((item) => (
                    <li key={item} className="ls-rm-item">
                      <span className="ls-rm-mark" aria-hidden />
                      <div>
                        <p className="ls-rm-title">{t(`items.${item}.title`)}</p>
                        {id !== 'live' && <p className="ls-rm-desc">{t(`items.${item}.desc`)}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Wrap>
      </div>
    </section>
  );
}
