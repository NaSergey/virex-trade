'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/auth/AuthContext';
import { VirexLogo } from '@/shared/ui/icon/VirexLogo';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated → bounce to the app.
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full tabular rounded-lg border border-line bg-app px-3 py-2 text-sm text-fg placeholder:text-subtle ' +
    'outline-none transition-colors duration-150 hover:border-line-strong focus:border-accent-2 focus:ring-1 focus:ring-accent-2';

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-app px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <VirexLogo className="h-8 w-8 text-fg" />
          <span className="text-base font-semibold tracking-tight text-fg">Virex</span>
        </div>

        <form onSubmit={onSubmit} className="panel space-y-4 p-6 shadow-(--shadow-medium)">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-fg">
              {mode === 'login' ? 'Вход в терминал' : 'Регистрация'}
            </h1>
            <p className="text-sm text-muted">
              {mode === 'login'
                ? 'Введите данные аккаунта, чтобы продолжить'
                : 'Создайте аккаунт, чтобы начать работу'}
            </p>
          </div>

          {mode === 'register' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted">
                Имя <span className="text-subtle">(необязательно)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                autoComplete="name"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted">Пароль</label>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full cursor-pointer rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? 'Подождите…'
              : mode === 'login'
                ? 'Войти'
                : 'Зарегистрироваться'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          className="mt-4 w-full cursor-pointer text-center text-sm text-muted transition-colors hover:text-fg"
        >
          {mode === 'login'
            ? 'Нет аккаунта? Зарегистрироваться'
            : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  );
}
