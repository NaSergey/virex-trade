'use client';

import { useTranslations } from 'next-intl';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { TradePlayMark } from '@/shared/ui/TradePlayMark';
import { cn } from '@/shared/lib/utils/css';
import type { AuthMode } from '@/features/auth';
import { useActiveSection } from '../lib/useActiveSection';

export const NAV_SECTIONS = ['platform', 'how', 'terminal', 'register'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

const LABEL: Record<NavSection, string> = {
  platform: 'navPlatform',
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
 * Подсветка вкладки живёт здесь, а не в странице: смена секции перерисовывает
 * только шапку, а не сцены с GSAP.
 */
export function LandingHeader({ onAuth }: { onAuth: (mode: AuthMode) => void }) {
  const t = useTranslations('landing');
  const active = useActiveSection(NAV_SECTIONS);

  return (
    <header className="ls-nav ls-dark">
      <div className="ls-nav-in">
        <a href="#platform" className="ls-nav-mark" aria-label="Trade Play">
          <TradePlayMark width={46} height={28} />
        </a>

        <nav className="ls-nav-tabs" aria-label={t('navLabel')}>
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
