'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { KeyValue } from '@/shared/ui/Lookup';
import { SectionHead } from '@/shared/ui/SectionHead';
import { CopyValue } from './CopyValue';
import type { Donation, DonationCreated } from '../api/hooks';

const mmss = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Обратный отсчёт идёт на клиенте от времени, названного сервером, и
 * пересчитывается от `expiresAt`, а не тикает от начального числа: вкладка в
 * фоне засыпает, и счётчик, уменьшающий сам себя раз в секунду, после
 * возвращения показывал бы время, которого уже нет.
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
 * Окно оплаты: QR, реквизиты и состояние платежа.
 *
 * Сумма стоит ВЫШЕ адреса и с предупреждением «ровно столько»: в системе с
 * одним кошельком на всех именно младшие знаки суммы отличают ваш перевод от
 * чужого, и человек должен прочитать это раньше, чем начнёт копировать адрес.
 * В QR сумма при этом не заложена (см. PaymentQrService на бэкенде) — кошельки
 * читают её оттуда как придётся, а вот адрес читают все.
 */
export function PaymentWindow({
  donation,
  live,
  onCancel,
  onRestart,
  canceling,
}: {
  donation: DonationCreated;
  /** Свежее состояние с сервера; до первого ответа опроса — сам интент. */
  live: Donation;
  onCancel: () => void;
  onRestart: () => void;
  canceling: boolean;
}) {
  const t = useTranslations('support');
  const pending = live.status === 'PENDING';
  const secondsLeft = useCountdown(live.expiresAt, pending);

  if (live.status === 'PAID') {
    return (
      <section className="don-done">
        <SectionHead title={t('thanksTitle')} />
        <p>{t('thanksBody', { amount: live.paidAmount ?? live.expectedAmount })}</p>
        {live.paidAfterExpiry && <p className="muted">{t('thanksLate')}</p>}
        {live.explorerUrl && (
          <p>
            <a href={live.explorerUrl} target="_blank" rel="noreferrer">
              {t('viewTransaction')}
            </a>
          </p>
        )}
        <Button onClick={onRestart}>{t('again')}</Button>
      </section>
    );
  }

  if (live.status === 'EXPIRED' || live.status === 'CANCELED') {
    return (
      <section className="don-done">
        <SectionHead title={live.status === 'EXPIRED' ? t('expiredTitle') : t('canceledTitle')} />
        <p className="muted">
          {live.status === 'EXPIRED' ? t('expiredBody') : t('canceledBody')}
        </p>
        {/* Не «платёж отменён»: перевод, уже ушедший в сеть, отозвать нельзя, и
            обещать этого нельзя тоже. Деньги, дошедшие с опозданием, сервер
            всё равно засчитает — об этом здесь и сказано. */}
        <p className="muted">{t('lateStillCounts')}</p>
        <Button onClick={onRestart}>{t('again')}</Button>
      </section>
    );
  }

  return (
    <section className="don-pay">
      <SectionHead title={t('payTitle')}>
        <span className="n">{t('timeLeft', { time: mmss(secondsLeft) })}</span>
      </SectionHead>

      <div className="don-pay-in">
        {donation.qrDataUrl && (
          <div className="don-qr">
            {/* eslint-disable-next-line @next/next/no-img-element -- data:URL от бэкенда, оптимизировать нечего */}
            <img src={donation.qrDataUrl} alt={t('qrAlt')} width={220} height={220} />
            <p className="muted">{t('qrNote')}</p>
          </div>
        )}

        <div className="don-req">
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
          <p className="muted">{t('networkWarning')}</p>

          <p className="muted">{t('waiting')}</p>
          <Button variant="bare" disabled={canceling} onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    </section>
  );
}
