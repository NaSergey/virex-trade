'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { AuthForm, safeNext, type AuthMode } from '@/features/auth';
import { TradePlayMark } from '@/shared/ui/TradePlayMark';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { SceneHead } from './SceneHead';

/**
 * «Регистрация» — последняя секция и единственное место входа в продукт.
 * Колонка по центру, как у страниц входа Linear и Mercury: знак, заголовок
 * состояния, форма. «Войти» в шапке ведёт сюда же и переключает форму на
 * вход — режим держит страница.
 *
 * Состояний три, у каждого свой заголовок: регистрация, регистрация по
 * приглашению (`ref` в адресе — под заголовком его код) и вход. Колонка
 * прибита к верху, а не центрована по высоте: поле «Имя» во входе
 * сворачивается, и центрованная колонка съезжала бы целиком при каждой
 * смене режима.
 *
 * Текста о платформе здесь нет: «Один аккаунт — вся платформа», абзац про
 * ключ Bybit и монеты, «Бесплатно…», а затем карточка игрока, печатавшая имя
 * из формы, стояли и сняты владельцем 2026-10-17. Не возвращать.
 *
 * Переход — колонка поднимается на въезде секции: знак, за ним заголовок и
 * форма.
 *
 * **Состояние из адреса — с первого кадра.** `?auth=login|register`, `next` и
 * `ref` читаются прямо при отрисовке, а не эффектом: эффект срабатывал после
 * первого кадра, и секция всегда сначала вставала регистрацией без
 * приглашения, а потом перестраивалась на глазах (жалоба владельца
 * 2026-10-17: «форма меняется, когда загружается»). `useSearchParams` держит
 * секцию под `Suspense` (`RegisterSceneHold` на сервере): без границы вся
 * главная отказалась бы от статической выдачи. Выбор на странице (`mode` —
 * «Войти» в шапке, переключатель формы) сильнее адреса.
 */
export function RegisterScene({
  mode: chosen,
  onMode,
}: {
  /** Выбор на странице; `null` — ничего не нажато, решает адрес. */
  mode: AuthMode | null;
  onMode: (mode: AuthMode) => void;
}) {
  const t = useTranslations('landing');
  const ta = useTranslations('auth');
  const root = useRef<HTMLElement>(null);

  const params = useSearchParams();
  const asked = params.get('auth');
  const urlMode: AuthMode | null = asked === 'login' || asked === 'register' ? asked : null;
  const mode = chosen ?? urlMode ?? 'register';
  const next = safeNext(params.get('next'));
  const refCode = params.get('ref') || undefined;

  // Пришедший с намерением (`?auth=…` — гейт, приглашение) попадает сразу к
  // форме. Один раз при заходе: дальше скроллом управляет он сам. **Якорь в
  // адресе сильнее намерения**: `?auth=login` остаётся в адресе после гейта, и
  // перезагрузка на `/?auth=login#platform` кидала к форме вместо «Платформы».
  useEffect(() => {
    if (urlMode && !window.location.hash) root.current?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при заходе
  }, []);

  useGSAP(
    () => {
      registerGsap();
      const el = root.current;
      if (!el || prefersReducedMotion()) return;
      gsap
        .timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: { trigger: el, start: 'top 80%', end: 'top 15%', scrub: 0.6 },
        })
        .fromTo('.ls-register-mark', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, 0)
        .fromTo('.ls-register-top', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, 0.15)
        .fromTo('.ls-register-form', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, 0.3);
    },
    { scope: root },
  );

  const invited = mode === 'register' && !!refCode;
  const heading =
    mode === 'login' ? t('loginHeading') : invited ? t('registerInvitedHeading') : t('registerHeading');

  return (
    <section className="ls-register" id="register" ref={root} aria-labelledby="register-title">
      <Wrap>
        <SceneHead stack kicker={mode === 'login' ? ta('loginTitle') : ta('registerTitle')} />

        <div className="ls-register-col">
          <TradePlayMark className="ls-register-mark" aria-hidden />
          <div className="ls-register-top">
            <p className="ls-register-title" id="register-title">
              {heading}
            </p>
            {invited && <p className="lbl ls-register-invite">{t('registerInvite', { code: refCode })}</p>}
          </div>
          <div className="ls-register-form">
            <AuthForm mode={mode} onModeChange={onMode} next={next} refCode={refCode} />
          </div>
        </div>
      </Wrap>
    </section>
  );
}

/**
 * Место секции, пока она не отрисована (сервер и кадр до гидрации): та же
 * высота и тот же якорь `#register`, чтобы ссылка «Регистрация» в шапке вела
 * туда же, а страница под ней не прыгала.
 */
export function RegisterSceneHold() {
  return <section className="ls-register" id="register" aria-hidden />;
}
