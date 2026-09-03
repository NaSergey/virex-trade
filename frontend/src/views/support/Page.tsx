'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { PageHead } from '@/shared/ui/PageHead';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Wrap } from '@/shared/ui/Wrap';
import { PaymentWindow } from './components/PaymentWindow';
import {
  useCancelDonation,
  useCreateDonation,
  useDonation,
  useDonationConfig,
  type DonationCreated,
} from './api/hooks';

const PRESETS = ['5', '10', '25', '50'];

/**
 * «Поддержать разработчика» — /support
 *
 * Одна кнопка, одно поле суммы и окно оплаты. Никакого выбора сети и токена:
 * приём один — USDT в TRON, — и предлагать выбор из одного пункта значит
 * заставлять человека принимать решение, которого нет.
 *
 * Сумма вводится с точностью до сотых, а платить придётся чуть больше: сервер
 * добавляет уникальный хвост в младших знаках, по которому и узнаёт платёж на
 * общем кошельке. Об этом сказано ДО нажатия кнопки — надбавка мизерная, но
 * увидеть 5.0043 вместо своих 5.00 в момент оплаты и не понять почему хуже,
 * чем прочитать строку заранее.
 */
export function SupportPage() {
  const t = useTranslations('support');
  const { data: config, isLoading } = useDonationConfig();
  const create = useCreateDonation();
  const cancel = useCancelDonation();

  const [amount, setAmount] = useState('5');
  const [intent, setIntent] = useState<DonationCreated | null>(null);

  // Свежее состояние окна оплаты. До первого ответа опроса показывается то,
  // что вернуло создание, — иначе панель мигала бы заглушкой сразу после
  // нажатия кнопки.
  const { data: live } = useDonation(intent?.id ?? null);
  const current = live ?? intent;

  const start = () => {
    create.mutate(amount.trim(), { onSuccess: (d) => setIntent(d) });
  };

  const restart = () => {
    setIntent(null);
    create.reset();
  };

  return (
    <Wrap page>
      <PageHead title={t('title')} lede={t('lede')} />

      {isLoading && <Skeleton height={120} />}

      {!isLoading && !config?.enabled && <p className="muted">{t('disabled')}</p>}

      {!isLoading && config?.enabled && !intent && (
        <section className="don-form">
          <Field label={t('amountLabel')} htmlFor="donation-amount">
            <Input
              id="donation-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-describedby="donation-amount-note"
            />
          </Field>

          <div className="don-presets">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                variant={amount === preset ? 'solid' : 'default'}
                onClick={() => setAmount(preset)}
              >
                {preset} {config.currency}
              </Button>
            ))}
          </div>

          <p id="donation-amount-note" className="muted">
            {t('amountRange', { min: config.minAmount, max: config.maxAmount })}
          </p>
          {/* Честная строка про надбавку: она и есть цена решения «один кошелёк
              на всех» и должна стоять там, где вводят сумму. */}
          <p className="muted">{t('surchargeNote', { max: config.maxSurcharge })}</p>
          <p className="muted">
            {t('windowNote', { minutes: Math.round(config.ttlSeconds / 60) })}
          </p>

          <ErrorNote error={create.error} fallback={t('createFailed')} />

          <Button variant="solid" disabled={create.isPending} onClick={start}>
            {create.isPending ? t('creating') : t('startButton')}
          </Button>
        </section>
      )}

      {intent && current && (
        <PaymentWindow
          donation={intent}
          live={current}
          canceling={cancel.isPending}
          onCancel={() => cancel.mutate(intent.id, { onSuccess: restart })}
          onRestart={restart}
        />
      )}
    </Wrap>
  );
}
