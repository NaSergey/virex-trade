'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthForm, safeNext } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';

/**
 * Вход на поддомене админки. Кука сессии у поддомена своя (ставится без
 * Domain), поэтому вход здесь — отдельный от продукта. Только вход: ни
 * регистрации, ни демо. Живую сессию уводит сама форма.
 */
export function AdminLoginPage() {
  const t = useTranslations('adminShell');
  const next = safeNext(useSearchParams().get('next'), '/');

  return (
    <Wrap page>
      <div className="adm-login">
        {/* Шапки админки здесь нет, а язык поддомена свой (кука без Domain) —
            переключатель нужен уже на входе. */}
        <PageHead title={t('loginTitle')}>
          <LocaleSwitch className="seg-tight" />
        </PageHead>
        <AuthForm initialMode="login" loginOnly next={next} />
      </div>
    </Wrap>
  );
}
