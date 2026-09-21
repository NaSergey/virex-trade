'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';

/**
 * Ссылка-приглашение — адрес витрины с открытым окном этого турнира
 * (`/games/trading?t=<id>`): отдельного инвайт-кода нет, id непрозрачный — тот
 * же довод, что у реферальной ссылки. Ведёт на витрину, а не на `/<id>`,
 * потому что по тому адресу стоит терминал, а пришедший по приглашению ещё
 * даже не участник — ему нужны условия турнира и кнопка входа.
 *
 * Адрес собирается в браузере, а не на сервере: домен знает только он, а
 * серверу для этого пришлось бы завести переменную окружения, которая молча
 * разойдётся с реальным адресом при первом же переезде.
 */
export function InviteLink({ id }: { id: string }) {
  const t = useTranslations('tournaments');
  const [copied, setCopied] = useState(false);
  // Домен знает только браузер, а на сервере его нет. useSyncExternalStore —
  // штатный способ прочитать такое значение: на сервере отдаётся пустая
  // строка, на клиенте настоящий origin, и разметка не расходится. Запись
  // состояния в эффекте дала бы лишний каскад рендеров ради того же самого.
  const origin = useSyncExternalStore(
    () => () => undefined,
    () => window.location.origin,
    () => '',
  );
  const url = origin ? `${origin}/games/trading?t=${id}` : '';

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div>
      <p className="muted">{t('inviteLead')}</p>
      <span className="don-copy">
        <span className="don-copy-v">{url}</span>
        <Button
          variant="bare"
          onClick={() => {
            navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              // Буфер недоступен (старый браузер, не HTTPS) — ссылка всё равно
              // на экране текстом, её можно выделить мышью.
              () => undefined,
            );
          }}
        >
          {copied ? t('copied') : t('copy')}
        </Button>
      </span>
    </div>
  );
}
