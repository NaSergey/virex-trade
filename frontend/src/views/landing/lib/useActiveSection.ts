'use client';

import { useEffect, useState } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { registerGsap } from './gsapConfig';

/**
 * Какая секция страницы сейчас под серединой экрана — для подсветки вкладки
 * в шапке. Секции ищутся по `id` в эффекте: к этому моменту React уже
 * вставил в DOM всё дерево, в том числе секции, стоящие в разметке после
 * шапки.
 *
 * Активна последняя по порядку из тех, что под серединой экрана; считается
 * заново на каждом переключении любой. Так вкладка верна и после прыжка
 * скролла через несколько секций сразу, и если секции когда-нибудь снова
 * зайдут друг на друга.
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    registerGsap();
    const found = ids.flatMap((id) => {
      const el = document.getElementById(id);
      return el ? [{ id, el }] : [];
    });
    const triggers: { id: string; trigger: ScrollTrigger }[] = [];
    const sync = () => {
      const on = triggers.filter((t) => t.trigger.isActive);
      setActive(on.length > 0 ? on[on.length - 1].id : null);
    };
    for (const { id, el } of found) {
      triggers.push({
        id,
        trigger: ScrollTrigger.create({ trigger: el, start: 'top 50%', end: 'bottom 50%', onToggle: sync }),
      });
    }
    return () => triggers.forEach((t) => t.trigger.kill());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids — статичный список страницы
  }, []);

  return active;
}
