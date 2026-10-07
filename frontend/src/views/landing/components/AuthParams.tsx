'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { safeNext, type AuthMode } from '@/features/auth';

/**
 * Читает намерение из адреса — `?auth=login|register&next=…&ref=…` — и один
 * раз передаёт его странице. Сюда ведут гейт `proxy.ts`, `AuthGuard`, ссылки
 * профиля и приглашения; `/login` пересылает сюда старые адреса.
 *
 * Отдельным компонентом под `Suspense`: `useSearchParams` без границы
 * заставил бы всю главную отказаться от статической выдачи.
 */
export function AuthParams({
  onIntent,
}: {
  onIntent: (intent: { mode: AuthMode | null; next: string; refCode?: string }) => void;
}) {
  const params = useSearchParams();

  useEffect(() => {
    const auth = params.get('auth');
    onIntent({
      mode: auth === 'login' || auth === 'register' ? auth : null,
      next: safeNext(params.get('next')),
      refCode: params.get('ref') ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- читается один раз при заходе
  }, []);

  return null;
}
