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
export function FinaleScene({ darkLayerRef }: { darkLayerRef: RefObject<HTMLDivElement | null> }) {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();

      if (prefersReducedMotion()) {
        // Подложку не трогаем: в этом режиме фон каждой сцене красит CSS
        // (см. landing.css), и общие слои остаются прозрачными.
        return;
      }

      const content = contentRef.current ? gsap.utils.toArray<HTMLElement>('.ls-finale-item', contentRef.current) : [];
      gsap.set(content, { opacity: 0, y: 16 });

      // Затемнение начинается, когда верх финала поднялся выше двух третей
      // экрана, а не когда он только выглянул снизу: с `top 90%` фон успевал
      // почти дочернеть, пока светлый текст сцены «честно» ещё занимал
      // верхнюю половину экрана.
      //
      // `end: 'max'` — низ документа, а не позиция финала во вьюпорте.
      // Финал вместе с футером короче экрана, поэтому его верх физически не
      // может подняться выше середины: любой `end` вида `top …%` оказывается
      // за пределами доступного скролла, и кроссфейд не доходит до конца —
      // на самом низу страницы фон так и оставался частично светлым.
      // `max` ScrollTrigger пересчитывает после того, как пины выше
      // раздвинут документ, поэтому конец гарантированно достижим.
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'max', scrub: 1 },
      });

      // Финал гасит светлую половину истории не тем же слоем, что зажёг её
      // интро, а вторым тёмным поверх (см. SceneBackground): один слой на две
      // сцены означал бы две записи в одно свойство и гонку на прыжках
      // скролла. `fromTo`, а не `to`: концы заданы числами, поэтому значение
      // слоя — чистая функция прогресса этого ScrollTrigger'а, а не того, что
      // в DOM оказалось в момент сборки таймлайна.
      if (darkLayerRef.current) {
        tl.fromTo(darkLayerRef.current, { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power1.inOut' }, 0);
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
