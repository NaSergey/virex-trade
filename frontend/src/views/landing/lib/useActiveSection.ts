'use client';

import { useEffect, useState } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { registerGsap } from './gsapConfig';

/**
 * Какая секция страницы сейчас под серединой экрана — для подсветки вкладки
 * в шапке. Секции ищутся по `id` в эффекте: к этому моменту React уже
 * вставил в DOM всё дерево, в том числе секции, стоящие в разметке после
 * шапки.
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    registerGsap();
    const triggers = ids.flatMap((id) => {
      const el = document.getElementById(id);
      if (!el) return [];
      return [
        ScrollTrigger.create({
          trigger: el,
          start: 'top 50%',
          end: 'bottom 50%',
          onToggle: (self) => {
            if (self.isActive) setActive(id);
          },
        }),
      ];
    });
    return () => triggers.forEach((t) => t.kill());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids — статичный список страницы
  }, []);

  return active;
}
