'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/shared/lib/utils/css';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { revealOnEnter } from '../lib/reveal';

const STEPS = [1, 2, 3] as const;

/**
 * «Как это работает» — три шага пути продукта.
 *
 * Раскладка: слева липкий указатель с номерами, справа сами шаги. Активный
 * номер выворачивается плашкой — тем же способом, каким в продукте помечено
 * выбранное; ничего нового в язык страницы это не вводит.
 *
 * Липкость сделана `position: sticky`, а не пином ScrollTrigger. Пин
 * вырезает блок из потока, подменяет его распоркой и меняет высоту
 * документа — от этого разъезжались границы соседних сцен, и прежняя главная
 * держала на это отдельный набор оговорок. Sticky делает то же самое
 * средствами браузера, высоты документа не трогает и не ломается на
 * разрывном прыжке скролла.
 */
export function StepsScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      registerGsap();
      const items = gsap.utils.toArray<HTMLElement>('.ls-step', root.current ?? undefined);
      if (items.length === 0) return;

      // Указатель ведёт по шагам всегда — это навигация, а не эффект, и в
      // режиме уменьшенного движения он нужен ровно так же.
      items.forEach((item, i) => {
        ScrollTrigger.create({
          trigger: item,
          start: 'top 62%',
          end: 'bottom 62%',
          onToggle: (self) => {
            if (self.isActive) setActive(i);
          },
        });
      });

      if (prefersReducedMotion()) return;

      items.forEach((item) => {
        const rule = item.querySelector<HTMLElement>('.ls-step-rule');
        const body = gsap.utils.toArray<HTMLElement>('.ls-step-line', item);
        gsap
          .timeline({ scrollTrigger: { trigger: item, start: 'top 82%', once: true } })
          .fromTo(rule, { scaleY: 0 }, { scaleY: 1, duration: 0.7, ease: 'power2.out' }, 0)
          .fromTo(body, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out' }, 0.1);
      });

      revealOnEnter(gsap.utils.toArray<HTMLElement>('.ls-index-item', root.current ?? undefined), {
        trigger: root.current,
        start: 'top 70%',
        y: 14,
        stagger: 0.08,
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-steps" ref={root}>
      <Wrap className="ls-steps-wrap">
        <aside className="ls-steps-aside">
          <h2 className="ls-kicker">{t('stepsTitle')}</h2>
          <ol className="ls-index">
            {STEPS.map((n, i) => (
              <li className={cn('ls-index-item', i === active && 'on')} key={n}>
                <span className="ls-index-n">{`0${n}`}</span>
                <span className="ls-index-t">{t(`step${n}Title`)}</span>
              </li>
            ))}
          </ol>
        </aside>

        <ol className="ls-steps-list">
          {STEPS.map((n) => (
            <li className="ls-step" key={n}>
              <span className="ls-step-rule" aria-hidden />
              <div className="ls-step-body">
                <span className="ls-step-n ls-step-line">{`0${n}`}</span>
                <h3 className="ls-step-line">{t(`step${n}Title`)}</h3>
                <p className="ls-step-line">{t(`step${n}Body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Wrap>
    </section>
  );
}
