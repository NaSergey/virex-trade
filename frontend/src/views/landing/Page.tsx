'use client';

import { Suspense, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AuthMode } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import './landing.css';
import { useLenis } from './lib/useLenis';
import { AuthParams } from './components/AuthParams';
import { LandingHeader } from './components/LandingHeader';
import { PlatformScene } from './components/PlatformScene';
import { RegisterScene } from './components/RegisterScene';
import { SceneBackground } from './components/SceneBackground';
import { ScrollProgress } from './components/ScrollProgress';
import { StepsScene } from './components/StepsScene';

/**
 * Главная — единственная страница продукта, открытая тому, у кого ещё нет
 * аккаунта, и она же — единственный вход: страницы `/login` и окна входа нет.
 *
 * Продукт — платформа, а не дневник сделок: журнал и аналитика, терминал,
 * тренажёр и игры. Три секции, по вкладке-якорю в шапке на каждую:
 *
 *   «Платформа»  — знак, собираемый скроллом, текст по краям;
 *   «Как это работает» — три шага пути (единственная секция, оставшаяся от
 *                  прежней главной);
 *   «Регистрация» — форма; «Войти» в шапке ведёт к ней же в режиме входа.
 *
 * Адрес `/?auth=login|register&next=…&ref=…` — сюда ведут гейт `proxy.ts`,
 * `AuthGuard` и старые ссылки с `/login` — сразу ставит форму в нужный режим
 * и прокручивает к ней.
 *
 * Страница живёт вне группы `(app)`: рейки разделов и защиты сессии у неё нет
 * — вошедшего сюда не пускает `proxy.ts`, он уходит к своим сделкам.
 */
export function LandingPage() {
  const t = useTranslations('landing');
  useLenis();

  const [mode, setMode] = useState<AuthMode>('register');
  const [next, setNext] = useState('/overview');
  const [refCode, setRefCode] = useState<string | undefined>(undefined);

  const onIntent = useCallback((intent: { mode: AuthMode | null; next: string; refCode?: string }) => {
    setNext(intent.next);
    setRefCode(intent.refCode);
    if (!intent.mode) return;
    setMode(intent.mode);
    document.getElementById('register')?.scrollIntoView();
  }, []);

  return (
    <>
      <a href="#content" className="ls-skip">
        {t('skipToContent')}
      </a>
      <Suspense fallback={null}>
        <AuthParams onIntent={onIntent} />
      </Suspense>
      <ScrollProgress />
      <LandingHeader onAuth={setMode} />
      <SceneBackground />

      {/* `ls-dark` на всём листе: лендинг не подчиняется теме продукта. */}
      <main className="ls-dark" id="content" tabIndex={-1}>
        <PlatformScene />
        <StepsScene />
        <RegisterScene mode={mode} onMode={setMode} next={next} refCode={refCode} />
      </main>

      <footer className="lp-foot ls-dark">
        <Wrap>
          <span className="muted">{t('footer')}</span>
        </Wrap>
      </footer>
    </>
  );
}
