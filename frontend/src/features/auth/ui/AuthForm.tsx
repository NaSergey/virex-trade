'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { API_BASE_URL } from '@/shared/config/api';
import { HOME_OF } from '@/shared/lib/utils/app-part';
import { useAppPart } from '@/shared/lib/utils/AppPartProvider';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../model/demo';
import { useAuth } from '../model/AuthContext';
import { GoogleMark } from './GoogleMark';

export type AuthMode = 'login' | 'register';

/** Основа для разбора `next`: важно только, остался ли адрес на ней. */
const PARSE_BASE = 'http://next.invalid';

/**
 * Куда вести после входа. Принимается только путь внутри продукта: без проверки
 * `?next=//evil.example` браузер прочтёт как адрес чужого сайта и уведёт туда сразу
 * после ввода пароля. `fallback` — главная той части, где стоит форма (`HOME_OF`).
 *
 * Решает тот же разбор адреса, которым пойдёт браузер, а не регулярка по строке:
 * `/\evil.example` и `/<таб>/evil.example` он читает как `//evil.example`, и строка
 * такого не покажет. Отдаётся исходная строка, а не разобранная: у `/.//evil.example`
 * разобранный путь — как раз `//evil.example`.
 */
export function safeNext(raw: string | null | undefined, fallback: string = HOME_OF.journal): string {
  if (!raw?.startsWith('/')) return fallback;
  try {
    return new URL(raw, PARSE_BASE).origin === PARSE_BASE ? raw : fallback;
  } catch {
    return fallback;
  }
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
 *
 * Поле «Имя» во входе не снимается, а сворачивается (`.auth-collapse`):
 * смена режима не перестраивает форму рывком. Свёрнутое поле выключено и
 * `inert` — не валидируется, не отправляется, фокус в него не попадает.
 *
 * `loginOnly` — вход админки на поддомене: ни регистрации, ни демо, ни Google там нет.
 *
 * «Продолжить с Google» — обычный переход на `/auth/google` (спека 2026-11-05):
 * сервер уводит на Google, возвращает с кукой сессии на `next`, а сбой — сюда же
 * с `error=GOOGLE_FAILED` в адресе (`errorCode`). Кнопка одна на оба режима:
 * аккаунта нет — он заводится.
 */
export function AuthForm({
  initialMode = 'register',
  mode: controlled,
  onModeChange,
  next,
  refCode,
  loginOnly = false,
  errorCode,
}: {
  initialMode?: AuthMode;
  mode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  /** Куда уйти после успешного входа — уже проверенный путь (`safeNext`). */
  next?: string;
  /** Кто пригласил: id из ссылки `?auth=register&ref=<userId>`. */
  refCode?: string;
  loginOnly?: boolean;
  /** Код ошибки из адреса (`?error=`) — пока только возврат после сбоя входа через Google. */
  errorCode?: string;
}) {
  const { user, loading, login, register } = useAuth();
  const home = HOME_OF[useAppPart()];
  const router = useRouter();
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const uid = useId();

  const [own, setOwn] = useState<AuthMode>(initialMode);
  const mode = loginOnly ? 'login' : (controlled ?? own);
  const setMode = (m: AuthMode) => {
    setOwn(m);
    onModeChange?.(m);
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  // Код из адреса переводится только известный: текст ошибки не берётся из ссылки.
  const [error, setError] = useState<string | null>(() =>
    errorCode === 'GOOGLE_FAILED' ? te('GOOGLE_FAILED') : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [demoing, setDemoing] = useState(false);
  const [googling, setGoogling] = useState(false);

  // «Назад» с экрана Google достаёт страницу из bfcache вместе с запертыми кнопками.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setGoogling(false);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  // Сессия жива — форма не нужна. Решает ответ /auth/refresh, а не кука в proxy:
  // мёртвая кука и AuthGuard уводили бы друг на друга. Вход этой формой уводит сам:
  // демо идёт на главную, а не в `next`.
  useEffect(() => {
    if (!loading && user && !submitting && !demoing) router.replace(next ?? home);
  }, [loading, user, submitting, demoing, next, home, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name || undefined, refCode);
      router.replace(next ?? home);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
      setSubmitting(false);
    }
  };

  /*
   * Демо — обычный вход обычной учёткой, просто поля заполняет кнопка. Ведёт
   * на главную, а не на `next`: в демо своих данных нет — показывать надо
   * витрину с начала, а не её случайный раздел.
   */
  const onDemo = async () => {
    setError(null);
    setDemoing(true);
    try {
      await login(DEMO_EMAIL, DEMO_PASSWORD);
      router.replace(home);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
      setDemoing(false);
    }
  };

  const onGoogle = () => {
    setError(null);
    setGoogling(true);
    const q = new URLSearchParams({ next: next ?? home });
    if (refCode) q.set('ref', refCode);
    window.location.assign(`${API_BASE_URL}/auth/google?${q.toString()}`);
  };

  const busy = submitting || demoing || googling;

  return (
    <div className="auth-form">
      <form onSubmit={onSubmit}>
        <div className="auth-collapse" data-open={mode === 'register'} inert={mode !== 'register'}>
          <div>
            <Field label={t('nameLabel')} htmlFor={`${uid}-name`}>
              <Input
                id={`${uid}-name`}
                full
                required
                disabled={mode !== 'register'}
                minLength={2}
                maxLength={40}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
        </div>

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

      {loginOnly ? null : (
        <>
          {/* Демо стоит сразу под входом, а не в конце: человеку, который ещё не
              решил заводить аккаунт, посмотреть продукт нужно раньше, чем
              выбирать между входом и регистрацией. */}
          <p className="auth-or" aria-hidden>
            {t('or')}
          </p>
          <Button variant="default" style={{ width: '100%' }} onClick={onGoogle} disabled={busy}>
            <GoogleMark />
            {googling ? t('submitting') : t('googleButton')}
          </Button>
          <Button
            variant="default"
            style={{ marginTop: 'var(--s2)', width: '100%' }}
            onClick={onDemo}
            disabled={busy}
          >
            {demoing ? t('submitting') : t('demoButton')}
          </Button>

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
        </>
      )}
    </div>
  );
}
