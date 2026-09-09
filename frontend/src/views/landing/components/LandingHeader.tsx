'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { Wrap } from '@/shared/ui/Wrap';

/**
 * Шапка лендинга. Скрыта до первого движения скролла — первый экран обязан
 * быть пустым, — затем мягко проявляется и остаётся доступной поверх всех
 * последующих сцен.
 *
 * Слушает нативный `scroll`, а не Lenis: тогда шапка реагирует на любой
 * источник движения (колесо, клавиатура, скролл по skip-ссылке), не завися
 * от того, создан ли в этот момент экземпляр Lenis — при
 * prefers-reduced-motion его не будет вовсе (см. useLenis).
 */
export function LandingHeader() {
  const t = useTranslations('landing');
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) return;
    const onScroll = () => {
      if (window.scrollY > 0) setRevealed(true);
    };
    // Проверка сразу, а не только по событию: страница может открыться уже
    // прокрученной (перезагрузка посреди истории, переход по якорю), и тогда
    // события `scroll` не будет — шапка осталась бы спрятанной до следующего
    // движения колеса.
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [revealed]);

  return (
    <header className={revealed ? 'lp-top lp-top-visible' : 'lp-top'} aria-hidden={!revealed}>
      <Wrap>
        <div className="lp-top-in">
          <div className="mark">Virex</div>
          <div className="lp-top-r">
            <ThemeToggle />
            <LocaleSwitch className="seg-tight" />
            <Link href="/login" className="lp-login" tabIndex={revealed ? 0 : -1}>
              {t('signIn')}
            </Link>
          </div>
        </div>
      </Wrap>
    </header>
  );
}
