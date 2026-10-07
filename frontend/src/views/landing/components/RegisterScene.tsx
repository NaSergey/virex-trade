'use client';

import { useTranslations } from 'next-intl';
import { AuthForm, type AuthMode } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';

/**
 * «Регистрация» — последняя секция и единственное место входа в продукт:
 * слева что делать после регистрации, справа форма. «Войти» в шапке ведёт
 * сюда же и переключает форму на вход — режим держит страница.
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

  return (
    <section className="ls-register" id="register" aria-labelledby="register-title">
      <Wrap className="ls-register-wrap">
        <div className="ls-register-copy">
          <h2 className="ls-kicker">{mode === 'login' ? ta('loginTitle') : ta('registerTitle')}</h2>
          <p className="ls-register-title" id="register-title">
            {t('registerTitle')}
          </p>
          <p className="lp-lede">{t('registerBody')}</p>
          <p className="lp-note">{t('registerNote')}</p>
        </div>

        <div className="ls-register-form">
          <AuthForm key={`${next}|${refCode ?? ''}`} mode={mode} onModeChange={onMode} next={next} refCode={refCode} />
        </div>
      </Wrap>
    </section>
  );
}
