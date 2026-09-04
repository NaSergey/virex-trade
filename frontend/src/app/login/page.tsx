'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DEMO_EMAIL, DEMO_PASSWORD, useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';

type Mode = 'login' | 'register';

/** Путь внутри продукта: один слэш, дальше не слэш (иначе это чужой домен). */
const NEXT_PATH = /^\/(?!\/)/;

/**
 * Вход. Ни карточки, ни рамки: форма стоит на том же единственном фоне, что и
 * весь продукт, и держится линейками полей — первое, что человек видит, уже
 * говорит, как этот интерфейс устроен.
 */
export default function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('auth');

  /*
   * Куда возвращать после входа: на страницу, с которой человека сюда завернул
   * AuthGuard, иначе на Обзор.
   *
   * Принимается только путь внутри продукта — начинающийся с одного слэша.
   * Без этой проверки `?next=//evil.example` браузер прочтёт как адрес чужого
   * сайта и уведёт туда сразу после ввода пароля.
   */
  const nextParam = params.get('next');
  const next = nextParam && NEXT_PATH.test(nextParam) ? nextParam : '/overview';

  /*
   * С какой стороны открыт вход. Кнопка «Начать» на главной ведёт сюда с
   * `?mode=register`: человек, пришедший заводить аккаунт, не должен
   * попадать на форму входа и искать переключатель. Всё, кроме явного
   * `register`, — обычный вход.
   */
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoing, setDemoing] = useState(false);

  // Уже авторизован → в приложение.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || undefined);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * Демо — обычный вход обычной учёткой, просто поля заполняет кнопка. Ведёт
   * на «Обзор», а не на `next`: человек, которого сюда завернули с закрытой
   * страницы, шёл к своим данным, а в демо своих данных нет — показывать надо
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
    } finally {
      setDemoing(false);
    }
  };

  const busy = submitting || demoing;

  return (
    <div
      style={{
        // dvh, а не vh: на телефоне vh считается от вьюпорта без адресной
        // строки, и форма, поставленная по центру такого экрана, оказывалась
        // ниже его середины — а на коротких экранах уезжала под клавиатуру.
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--s4)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="mark" style={{ marginBottom: 'var(--s5)' }}>
          {t('brand')}
        </div>

        <h1>{mode === 'login' ? t('loginTitle') : t('registerTitle')}</h1>
        <p className="lede" style={{ marginBottom: 'var(--s4)' }}>
          {mode === 'login' ? t('loginLede') : t('registerLede')}
        </p>

        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <Field label={t('nameLabel')} htmlFor="name">
              <Input
                id="name"
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

          <Field label={t('emailLabel')} htmlFor="email">
            <Input
              id="email"
              full
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label={t('passwordLabel')} htmlFor="password">
            <Input
              id="password"
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
        <Button
          variant="default"
          style={{ marginTop: 'var(--s3)', width: '100%' }}
          onClick={onDemo}
          disabled={busy}
        >
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
    </div>
  );
}
