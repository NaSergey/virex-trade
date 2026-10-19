'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthForm, safeNext, useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';

/**
 * Вход на поддомене админки. Кука сессии у поддомена своя (ставится без
 * Domain), поэтому вход здесь — отдельный от продукта. Только вход: ни
 * регистрации, ни демо.
 */
export function AdminLoginPage() {
  const t = useTranslations('adminShell');
  const { user, loading } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'), '/');

  // Сессия жива — форма не нужна. Решает ответ /auth/refresh, а не кука в
  // proxy: протухшая кука и AuthGuard уводили бы друг на друга по кругу.
  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  return (
    <Wrap page>
      <div className="adm-login">
        <PageHead title={t('loginTitle')} />
        <AuthForm initialMode="login" loginOnly next={next} />
      </div>
    </Wrap>
  );
}
