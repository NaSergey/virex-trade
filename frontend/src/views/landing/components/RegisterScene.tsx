'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { AuthForm, type AuthMode } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';
import { SceneHead } from './SceneHead';

/**
 * «Регистрация» — последняя секция и единственное место входа в продукт:
 * слева с чего начать, справа форма. «Войти» в шапке ведёт сюда же и
 * переключает форму на вход — режим держит страница.
 *
 * Переход — свой: **половины сходятся**. Пока секция въезжает, текст идёт
 * слева, форма — справа, и встают на места, когда секция доехала.
 *
 * Ключ формы — `next`/`ref`: пришедший по приглашению (`?auth=register&ref=…`)
 * должен получить именно его, а параметры читаются уже после первого кадра.
 */
export function RegisterScene({
  mode,
  onMode,
  next,
  refCode,
}: {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  next: string;
  refCode?: string;
}) {
  const t = useTranslations('landing');
  const ta = useTranslations('auth');
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      registerGsap();
      const el = root.current;
      if (!el || prefersReducedMotion()) return;
      gsap
        .timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: { trigger: el, start: 'top 75%', end: 'top 12%', scrub: 0.6 },
        })
        .fromTo('.ls-head', { x: -90, opacity: 0 }, { x: 0, opacity: 1, duration: 1 }, 0)
        .fromTo('.ls-register-form', { x: 90, opacity: 0 }, { x: 0, opacity: 1, duration: 1 }, 0.1);
    },
    { scope: root },
  );

  return (
    <section className="ls-register" id="register" ref={root} aria-labelledby="register-title">
      <Wrap className="ls-register-wrap">
        <SceneHead
          stack
          kicker={mode === 'login' ? ta('loginTitle') : ta('registerTitle')}
          title={t('registerTitle')}
          lede={t('registerBody')}
          titleId="register-title"
        >
          <p className="lp-note">{t('registerNote')}</p>
        </SceneHead>

        <div className="ls-register-form">
          <AuthForm key={`${next}|${refCode ?? ''}`} mode={mode} onModeChange={onMode} next={next} refCode={refCode} />
        </div>
      </Wrap>
    </section>
  );
}
