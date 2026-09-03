'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  useTelegramLink,
  useTelegramStatus,
  useTelegramTest,
  useTelegramUnlink,
} from '../api/telegram-hooks';

/**
 * Привязка чата и список включённых уведомлений. Переключателей здесь нет
 * намеренно: настройка живёт в боте, а второе место редактирования того же
 * состояния — это второй набор багов.
 */
export function TelegramCard() {
  const t = useTranslations('settings');
  const { data, isLoading } = useTelegramStatus();
  const link = useTelegramLink();
  const unlink = useTelegramUnlink();
  const test = useTelegramTest();

  if (isLoading) return <Skeleton height={120} />;
  if (!data?.enabled) {
    return (
      <>
        <h2>{t('telegramTitle')}</h2>
        <p className="muted">{t('telegramDisabled')}</p>
      </>
    );
  }

  if (!data.linked) {
    return (
      <>
        <h2>{t('telegramTitle')}</h2>
        <p className="muted">{t('telegramNotLinked')}</p>
        {link.data?.url ? (
          <>
            {/* Обычная ссылка, а не Button: примитив рендерит только <button>,
                а подменять его тег ради одного места — портить примитив. */}
            <p>
              <a href={link.data.url} target="_blank" rel="noreferrer">
                {t('telegramOpenBot')}
              </a>
            </p>
            <p className="foot">{t('telegramLinkHint')}</p>
          </>
        ) : (
          <Button variant="solid" disabled={link.isPending} onClick={() => link.mutate()}>
            {t('telegramLinkAction')}
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <h2>{t('telegramTitle')}</h2>
      <p className="muted">{t('telegramLinked')}</p>
      {data.notifications.length > 0 ? (
        <>
          <p className="muted">{t('telegramEnabledList')}</p>
          <ul>
            {data.notifications.map((n) => (
              <li key={n.key}>{n.title}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{t('telegramNothingEnabled')}</p>
      )}
      <p className="foot">{t('telegramSettingsHint')}</p>
      <Button disabled={test.isPending} onClick={() => test.mutate()}>
        {test.isSuccess ? t('telegramTestSent') : t('telegramTest')}
      </Button>
      <Button disabled={unlink.isPending} onClick={() => unlink.mutate()}>
        {t('telegramUnlink')}
      </Button>
    </>
  );
}
