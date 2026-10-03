'use client';

import { useTranslations } from 'next-intl';
import { usePrivacy, useSetPrivacy } from '@/entities/profile';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * Кто видит мои сделки. Один переключатель — показывать ли их на профиле
 * (решение владельца 2026-10-02: показывать, но дать возможность закрыть).
 *
 * Карточка **обязана сказать, что именно видно другим**, а не просто показать
 * тумблер: флаг стоит включённым по умолчанию, то есть у уже заведённых
 * аккаунтов журнал открылся сам, без их действия. Переключатель без этой
 * фразы оставлял бы человека узнавать о показе от кого-то другого.
 *
 * Стоит рядом с Telegram, а не в карточке биржи: к ключам это не относится —
 * показ сделок работает одинаково, какая бы биржа ни была подключена.
 */
export function PrivacyCard() {
  const t = useTranslations('settings');
  const { data, isLoading } = usePrivacy();
  const save = useSetPrivacy();

  if (isLoading) return <Skeleton height={96} />;

  // Пока запрос в полёте, показывается то, что человек нажал: ответ приходит
  // через сеть, и тумблер, отъезжающий назад на эти миллисекунды, читается
  // как «не сработало».
  const on = save.isPending ? save.variables : (data?.showTrades ?? true);

  return (
    <>
      <h2>{t('privacyTitle')}</h2>
      <p className="muted">{t('privacyLede')}</p>
      <div className="nt-row">
        <label className="opt" data-on={on}>
          <input
            type="checkbox"
            checked={on}
            disabled={save.isPending}
            onChange={(e) => save.mutate(e.target.checked)}
          />
          <span className="opt-n">{t('privacyShowTrades')}</span>
        </label>
      </div>
      <p className="foot">{on ? t('privacyOnFoot') : t('privacyOffFoot')}</p>
      <ErrorNote error={save.error} fallback={t('privacyFailed')} />
    </>
  );
}
