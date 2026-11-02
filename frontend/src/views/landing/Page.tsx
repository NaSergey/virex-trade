'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AuthMode } from '@/features/auth';
import { LANDING_PATH } from '@/shared/config/site';
import { Wrap } from '@/shared/ui/Wrap';
import './landing.css';
import { useLenis } from './lib/useLenis';
import { AboutScene } from './components/AboutScene';
import { GamesScene } from './components/GamesScene';
import { LandingHeader, type NavSection } from './components/LandingHeader';
import { PlatformScene } from './components/PlatformScene';
import { RegisterScene, RegisterSceneHold } from './components/RegisterScene';
import { SceneBackground } from './components/SceneBackground';
import { ScrollProgress } from './components/ScrollProgress';
import { StepsScene } from './components/StepsScene';
import { TerminalScene } from './components/TerminalScene';

/**
 * Рамка главной: страница, открытая тому, у кого ещё нет аккаунта, и она же —
 * единственный вход: страницы `/login` и окна входа нет. Своя главная у каждой части
 * продукта (спека 2026-11-03), секции у них разные, а рамка и форма — одни.
 *
 * Переход на въезде ведёт сама сцена: дорога, экран встаёт из наклона, колонка входа
 * поднимается; у первого экрана и терминала переходов нет. Шапка у всех одна
 * (`SceneHead`) и встаёт в одно место — сразу под меню.
 *
 * Адрес `/?auth=login|register&next=…&ref=…` — сюда ведут гейт `proxy.ts`,
 * `AuthGuard` и старые ссылки с `/login` — сразу ставит форму в нужный режим
 * и прокручивает к ней. Адрес читает сама секция (`RegisterScene`), страница
 * держит только выбор, сделанный здесь: «Войти» в шапке и переключатель
 * формы (`mode`, пока ничего не нажато, — `null`, и решает адрес).
 *
 * Страница живёт вне группы `(app)`: рейки разделов и защиты сессии у неё нет
 * — вошедшего сюда не пускает `proxy.ts`, он уходит на главную своей части.
 */
function Frame({
  sections,
  footer,
  scenes,
}: {
  sections: readonly NavSection[];
  footer: string;
  scenes: (onAuth: (mode: AuthMode) => void) => ReactNode;
}) {
  const t = useTranslations('landing');
  const locale = useLocale();
  useLenis();

  const [mode, setMode] = useState<AuthMode | null>(null);

  // Адрес идёт за языком (`/` и `/ru`), без перехода: язык на `/ru` задан адресом,
  // и выбравший английский иначе получал бы русский на первой же перезагрузке.
  useEffect(() => {
    const path = locale === 'ru' ? LANDING_PATH.ru : LANDING_PATH.en;
    const { pathname, search, hash } = window.location;
    if (pathname !== path) window.history.replaceState(null, '', `${path}${search}${hash}`);
  }, [locale]);

  return (
    <>
      <a href="#content" className="ls-skip">
        {t('skipToContent')}
      </a>
      <ScrollProgress />
      <LandingHeader sections={sections} onAuth={setMode} />
      <SceneBackground />

      {/* `ls-dark` на всём листе: лендинг не подчиняется теме продукта. */}
      <main className="ls-dark" id="content" tabIndex={-1}>
        {scenes(setMode)}
        <Suspense fallback={<RegisterSceneHold />}>
          <RegisterScene mode={mode} onMode={setMode} />
        </Suspense>
      </main>

      <footer className="lp-foot ls-dark">
        <Wrap>
          <span className="muted">{footer}</span>
        </Wrap>
      </footer>
    </>
  );
}

const PLAY_SECTIONS = ['platform', 'games', 'about', 'register'] as const;
const JOURNAL_SECTIONS = ['platform', 'terminal', 'how', 'register'] as const;

/**
 * Главная площадки — превью: знак, настоящие карточки игр, дорожная карта, регистрация.
 */
export function PlayLanding() {
  const t = useTranslations('landing');
  return (
    <Frame
      sections={PLAY_SECTIONS}
      footer={t('playFooter')}
      scenes={(onAuth) => (
        <>
          <PlatformScene />
          <GamesScene onRegister={() => onAuth('register')} />
          <AboutScene />
        </>
      )}
    />
  );
}

/**
 * Главная журнала: знак, настоящий терминал на демо-счёте гостя, четыре раздела с их
 * экранами, регистрация. С неё начинается путь готовности продукта: ключи, сделки,
 * тег, срез.
 */
export function JournalLanding() {
  const t = useTranslations('landing');
  return (
    <Frame
      sections={JOURNAL_SECTIONS}
      footer={t('footer')}
      scenes={() => (
        <>
          <PlatformScene />
          <TerminalScene />
          <StepsScene />
        </>
      )}
    />
  );
}
