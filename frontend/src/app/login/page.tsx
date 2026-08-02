'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';

type Mode = 'login' | 'register';

/**
 * Вход. Ни карточки, ни рамки: форма стоит на том же единственном фоне, что и
 * весь продукт, и держится линейками полей — первое, что человек видит, уже
 * говорит, как этот интерфейс устроен.
 */
export default function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Уже авторизован → в приложение.
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || undefined);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--s4)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div className="mark" style={{ marginBottom: 'var(--s5)' }}>
          Virex
        </div>

        <h1>{mode === 'login' ? 'Вход' : 'Регистрация'}</h1>
        <p className="lede" style={{ marginBottom: 'var(--s4)' }}>
          {mode === 'login'
            ? 'Журнал криптофьючерсов: сделки, разметка и статистика по ней.'
            : 'Создайте аккаунт — дальше подключите биржевые ключи в настройках.'}
        </p>

        <form onSubmit={onSubmit}>
          {mode === 'register' && (
            <Field label="Имя (необязательно)" htmlFor="name">
              <Input
                id="name"
                full
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}

          <Field label="Почта" htmlFor="email">
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

          <Field label="Пароль" htmlFor="password">
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

          <Button type="submit" variant="solid" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </Button>
        </form>

        <Button
          variant="bare"
          style={{ marginTop: 'var(--s3)', width: '100%' }}
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </Button>
      </div>
    </div>
  );
}
