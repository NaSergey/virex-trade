'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { KeyValue } from '@/shared/ui/Lookup';
import { CopyValue } from './CopyValue';
import type { Donation, DonationCreated } from '../api/hooks';

const mmss = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Обратный отсчёт идёт от времени, названного сервером, и пересчитывается от
 * `expiresAt`, а не тикает от начального числа: вкладка в фоне засыпает, и
 * счётчик, уменьшающий сам себя раз в секунду, после возвращения показывал бы
 * время, которого уже нет.
 *
 * Решает при этом всё равно сервер: ноль на часах не меняет статус — статус
 * приезжает опросом. Иначе платёж, подтверждённый на последней секунде,
 * человек увидел бы как «время истекло».
 */
function useCountdown(expiresAt: string, active: boolean): number {
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (!active) return;
    const tick = () =>
      setLeft(Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, active]);

  return left;
}

/**
 * Второй шаг модалки: QR и реквизиты.
 *
 * Сумма стоит ВЫШЕ адреса и с предупреждением «ровно столько»: при одном
 * кошельке на всех именно младшие знаки суммы отличают ваш перевод от чужого,
 * и человек должен прочитать это раньше, чем начнёт копировать адрес. В самом
 * QR суммы нет (см. PaymentQrService на бэкенде) — кошельки читают её оттуда
 * как придётся, а вот адрес читают все.
 *
 * QR и реквизиты идут столбиком, а не рядом: диалог шириной 520px, и колонка
 * реквизитов рядом с кодом рвала бы адрес на пять строк.
 */
export function PaymentStep({
  intent,
  live,
  onDone,
}: {
  /** Ответ создания: только в нём приезжает картинка QR. */
  intent: DonationCreated;
  /** Свежее состояние с сервера; до первого ответа опроса — сам интент. */
  live: Donation;
  /** Закрыть окно: платёж отслеживается и без него. */
  onDone: () => void;
}) {
  const t = useTranslations('support');
  const tc = useTranslations('common');
  const secondsLeft = useCountdown(live.expiresAt, live.status === 'PENDING');

  return (
    <div className="don-pay">
      {intent.qrDataUrl && (
        <div className="don-qr">
          {/* eslint-disable-next-line @next/next/no-img-element -- data:URL от бэкенда, оптимизировать нечего */}
          <img src={intent.qrDataUrl} alt={t('qrAlt')} width={200} height={200} />
        </div>
      )}

      <KeyValue label={t('amountLabel')}>
        <CopyValue value={live.expectedAmount} label={t('amountLabel')} />
      </KeyValue>
      <p className="dbt don-exact">{t('amountExact')}</p>

      <KeyValue label={t('addressLabel')}>
        <CopyValue value={live.receivingAddress} label={t('addressLabel')} />
      </KeyValue>
      <KeyValue label={t('networkLabel')}>
        {live.network} · {live.currency}
      </KeyValue>
      <KeyValue label={t('timeLeftLabel')}>{mmss(secondsLeft)}</KeyValue>

      <p className="muted">{t('networkWarning')}</p>

      {/* «Готово» закрывает окно, а не подтверждает платёж: подтверждает его
          сеть, и опрос доведёт донат до конца даже с закрытым окном. Кнопка
          по центру, потому что она здесь одна — пары «отмена / действие», под
          которую сделан подвал диалога, на этом шаге нет. */}
      <div className="don-done-row">
        <Button variant="solid" onClick={onDone}>
          {tc('done')}
        </Button>
      </div>
    </div>
  );
}
