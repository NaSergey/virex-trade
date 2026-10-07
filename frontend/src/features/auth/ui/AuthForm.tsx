'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../model/demo';
import { useAuth } from '../model/AuthContext';

export type AuthMode = 'login' | 'register';

/** Путь внутри продукта: один слэш, дальше не слэш (иначе это чужой домен). */
const NEXT_PATH = /^\/(?!\/)/;

/**
 * Куда вести после входа. Принимается только путь внутри продукта —
 * начинающийся с одного слэша: без проверки `?next=//evil.example` браузер
 * прочтёт как адрес чужого сайта и уведёт туда сразу после ввода пароля.
 */
export function safeNext(raw: string | null | undefined): string {
  return raw && NEXT_PATH.test(raw) ? raw : '/overview';
}

/**
 * Форма входа и регистрации — единственная в продукте: стоит секцией
 * «Регистрация» на главной, «Войти» в шапке ведёт к ней же. Страницы `/login`
 * и окна входа нет (`/login` только пересылает сюда по старым ссылкам).
 *
 * Режим можно отдать снаружи (`mode` + `onModeChange`): шапка переключает
 * форму на вход, не перемонтируя её — набранная почта не теряется.
 *
 * Ни карточки, ни рамки: форма держится линейками полей — тем же языком,
 * что и весь продукт.
 */
export function AuthForm({
  initialMode = 'register',
  mode: controlled,
  onModeChange,
  next = '/overview',
  refCode,
}: {
  initialMode?: AuthMode;
  mode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  /** Куда уйти после успешного входа — уже проверенный путь (`safeNext`). */
  next?: string;
  /** Кто пригласил: id из ссылки `?auth=register&ref=<userId>`. */
  refCode?: string;
}) {
  const { login, register } = useAuth();
  const router = useRouter();
  const t = useTranslations('auth');
  const uid = useId();

  const [own, setOwn] = useState<AuthMode>(initialMode);
  const mode = controlled ?? own;
  const setMode = (m: AuthMode) => {
    setOwn(m);
    onModeChange?.(m);
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoing, setDemoing] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || undefined, refCode);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
      setSubmitting(false);
    }
  };

  /*
   * Демо — обычный вход обычной учёткой, просто поля заполняет кнопка. Ведёт
   * на «Обзор», а не на `next`: в демо своих данных нет — показывать надо
   * витрину с начала, а не её случайный раздел.
   */
  const onDemo = async () => {
    setError(null);
    setDemoing(true);
    try {
      await login(DEMO_EMAIL, DEMO_PASSWORD);
      router.replace('/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
      setDemoing(false);
    }
  };

  const busy = submitting || demoing;

  return (
    <div className="auth-form">
      <form onSubmit={onSubmit}>
        {mode === 'register' && (
          <Field label={t('nameLabel')} htmlFor={`${uid}-name`}>
            <Input
              id={`${uid}-name`}
              full
              required
              minLength={2}
              maxLength={40}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}

        <Field label={t('emailLabel')} htmlFor={`${uid}-email`}>
          <Input
            id={`${uid}-email`}
            full
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label={t('passwordLabel')} htmlFor={`${uid}-password`}>
          <Input
            id={`${uid}-password`}
            full
            type="password"
            required
            minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && (
          <p className="warn" style={{ marginBottom: 'var(--s3)' }}>
            {error}
          </p>
        )}

        <Button type="submit" variant="solid" style={{ width: '100%' }} disabled={busy}>
          {submitting ? t('submitting') : mode === 'login' ? t('submitLogin') : t('submitRegister')}
        </Button>
      </form>

      {/* Демо стоит сразу под входом, а не в конце: человеку, который ещё не
          решил заводить аккаунт, посмотреть продукт нужно раньше, чем
          выбирать между входом и регистрацией. */}
      <Button variant="default" style={{ marginTop: 'var(--s3)', width: '100%' }} onClick={onDemo} disabled={busy}>
        {demoing ? t('submitting') : t('demoButton')}
      </Button>
      <p className="muted" style={{ marginTop: 'var(--s2)', textAlign: 'center' }}>
        {t('demoNote')}
      </p>

      <Button
        variant="bare"
        style={{ marginTop: 'var(--s3)', width: '100%' }}
        disabled={busy}
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError(null);
        }}
      >
        {mode === 'login' ? t('switchToRegister') : t('switchToLogin')}
      </Button>
    </div>
  );
}
