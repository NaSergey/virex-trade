'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { TradePlayMark } from '@/shared/ui/TradePlayMark';
import { cn } from '@/shared/lib/utils/css';
import type { AuthMode } from '@/features/auth';
import { useActiveSection } from '../lib/useActiveSection';

export const NAV_SECTIONS = ['platform', 'about', 'terminal', 'how', 'register'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

const LABEL: Record<NavSection, string> = {
  platform: 'navPlatform',
  about: 'navAbout',
  how: 'navHow',
  terminal: 'navTerminal',
  register: 'navRegister',
};

/**
 * Шапка главной: знак, вкладки-якоря и справа язык и «Войти».
 *
 * Всё здесь — ссылки на `#id`: плавную прокрутку к якорю берёт на себя Lenis
 * (`anchors`). «Войти» — тоже якорь, на ту же форму, что «Регистрация», но
 * переключает её на вход (`onAuth`): окна входа на главной нет, форма одна.
 *
 * Активная вкладка — та же плашка, что у рейки внутри продукта (`TopNav`): один
 * слой, который едет вдоль вкладок, а не фон, переключаемый на разных ссылках.
 * Её left/width снимаются с самой активной ссылки, подгонка под догрузившийся
 * шрифт идёт молча, переезд — анимацией.
 *
 * Подсветка вкладки живёт здесь, а не в странице: смена секции перерисовывает
 * только шапку, а не сцены с GSAP.
 */
export function LandingHeader({ onAuth }: { onAuth: (mode: AuthMode) => void }) {
  const t = useTranslations('landing');
  const active = useActiveSection(NAV_SECTIONS);
  const tabs = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    const place = (animated: boolean) => {
      const on = tabs.current?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!on) {
        setMoving(false);
        setIndicator(null);
        return;
      }
      setMoving(animated);
      setIndicator({ left: on.offsetLeft, width: on.offsetWidth });
    };
    const settle = () => place(false);
    place(true);
    document.fonts?.ready?.then(settle);
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
  }, [active]);

  return (
    <header className="ls-nav ls-dark">
      <div className="ls-nav-in">
        <a href="#platform" className="ls-nav-mark" aria-label="Trade Play">
          <TradePlayMark width={46} height={28} />
        </a>

        <nav className="ls-nav-tabs" aria-label={t('navLabel')} ref={tabs}>
          {indicator && (
            <span
              className={cn('ls-nav-indicator', moving && 'is-moving')}
              style={{ transform: `translateX(${indicator.left}px) scaleX(${indicator.width})` }}
              aria-hidden
            />
          )}
          {NAV_SECTIONS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn('ls-nav-tab', active === id && 'on')}
              aria-current={active === id ? 'true' : undefined}
              onClick={id === 'register' ? () => onAuth('register') : undefined}
            >
              {t(LABEL[id])}
            </a>
          ))}
        </nav>

        <div className="ls-nav-r">
          <LocaleSwitch className="seg-tight" />
          <a href="#register" className="ls-nav-signin" onClick={() => onAuth('login')}>
            {t('signIn')}
          </a>
        </div>
      </div>
    </header>
  );
}
