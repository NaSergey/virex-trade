'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/shared/ui/dialog';
import { PaymentStep } from './PaymentStep';
import {
  useCancelDonation,
  useCreateDonation,
  useDonation,
  useDonationConfig,
  type DonationCreated,
} from '../api/hooks';

/**
 * Пять сумм от 10 до 100. После 25 шаг ровный (25 → 50 → 75 → 100): рядом
 * стоящие деления должны отличаться заметно, иначе выбор между 40 и 50
 * превращается в задачу, которой у человека не было.
 */
const PRESETS = ['10', '25', '50', '75', '100'];

/**
 * «Поддержать разработчика» — одно окно в два шага: сумма, затем QR.
 *
 * Модалка, а не страница: донат — это короткий разговор в сторону от работы с
 * журналом, и уводить человека с раздела, где он читал свои сделки, ради него
 * незачем. Оба шага живут в одном окне — второй шаг это продолжение первого, а
 * не другое место.
 *
 * Никакого выбора сети и токена: приём один — USDT в TRON, — и предлагать
 * выбор из одного пункта значит заставлять принимать решение, которого нет.
 *
 * Закрытие окна НЕ отменяет платёж: перевод, уже ушедший в сеть, отозвать
 * нельзя, и сервер засчитает его с запасом сверх окна. Отмена — отдельная
 * кнопка, и она означает «я передумал платить», а не «верните перевод».
 */
export function DonateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('support');
  const tc = useTranslations('common');
  const { data: config, isLoading } = useDonationConfig();
  const create = useCreateDonation();
  const cancel = useCancelDonation();

  // Первая из кнопок, а не произвольное число: иначе окно открывается со
  // значением, которому не соответствует ни одно деление, и ряд выглядит так,
  // будто выбор ещё не сделан.
  const [amount, setAmount] = useState(PRESETS[0]);
  const [intent, setIntent] = useState<DonationCreated | null>(null);

  // Свежее состояние окна оплаты. До первого ответа опроса показывается то,
  // что вернуло создание, — иначе окно мигало бы заглушкой сразу после нажатия.
  const { data: live } = useDonation(intent?.id ?? null);
  const current = live ?? intent;

  const reset = () => {
    setIntent(null);
    create.reset();
    cancel.reset();
  };

  const close = () => {
    onClose();
    // Сброс после закрытия: следующее открытие начинается с суммы, а не с
    // чужого уже истёкшего окна оплаты.
    reset();
  };

  const status = current?.status;
  const paid = status === 'PAID';
  const dead = status === 'EXPIRED' || status === 'CANCELED';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader
          title={t('title')}
          subtitle={t('lede')}
          /* Сколько уже собрано — на всех шагах окна: это про проект, а не
             про текущий платёж, и после «спасибо» оно тоже уместно. */
          aside={
            config?.enabled ? (
              <div className="don-total">
                <span className="lbl">{t('totalLabel')}</span>
                <b>
                  {config.totalRaised} {config.currency}
                </b>
              </div>
            ) : null
          }
        />

        <DialogBody>
          {isLoading && <Skeleton height={96} />}
          {!isLoading && !config?.enabled && <p className="muted">{t('disabled')}</p>}

          {/* Шаг 1 — сумма. */}
          {!isLoading && config?.enabled && !intent && (
            <>
              <Field
                label={`${t('amountLabel')}, ${config.currency}`}
                htmlFor="donation-amount"
              >
                <Input
                  id="donation-amount"
                  full
                  inputMode="decimal"
                  autoFocus
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
                    {/* Только число: валюта названа в подзаголовке окна и в
                        реквизитах, а пять кнопок с «USDT» в подписи в строку
                        уже не помещаются и рвутся на две. */}
                    {preset}
                  </Button>
                ))}
              </div>

              {/* На что уходят деньги — единственное, что человеку интересно
                  на этом шаге. Границы суммы проверяет поле, про уникальный
                  хвост сказано на шаге оплаты, где эта сумма и появляется
                  (`amountExact`), а таймер окна виден там же счётчиком.
                  Блок отбит линейкой: это не подпись к полю, а отдельная
                  мысль — куда пойдут деньги и что будет дальше. */}
              <div className="don-purpose" id="donation-amount-note">
                <p>{t('purpose')}</p>
                <p>{t('purposeFree')}</p>
              </div>
              <ErrorNote error={create.error} fallback={t('createFailed')} />
            </>
          )}

          {/* Шаг 2 — оплата. */}
          {intent && current && !paid && !dead && (
            <PaymentStep intent={intent} live={current} onDone={close} />
          )}

          {paid && current && (
            <div className="don-done">
              <p>{t('thanksBody', { amount: current.paidAmount ?? current.expectedAmount })}</p>
              {current.paidAfterExpiry && <p className="muted">{t('thanksLate')}</p>}
              {current.explorerUrl && (
                <p>
                  <a href={current.explorerUrl} target="_blank" rel="noreferrer">
                    {t('viewTransaction')}
                  </a>
                </p>
              )}
            </div>
          )}

          {dead && (
            <div className="don-done">
              <p>{status === 'EXPIRED' ? t('expiredBody') : t('canceledBody')}</p>
              {/* Не «платёж отменён»: перевод, ушедший в сеть, отозвать нельзя,
                  и обещать этого нельзя тоже. */}
              <p className="muted">{t('lateStillCounts')}</p>
            </div>
          )}
        </DialogBody>

        {/* Шаг 1: «Отмена» + «Перейти к оплате». */}
        {!intent && (
          <DialogActions
            confirmLabel={create.isPending ? t('creating') : t('startButton')}
            confirmDisabled={!config?.enabled || create.isPending}
            onConfirm={() => create.mutate(amount.trim(), { onSuccess: setIntent })}
            onCancel={close}
          />
        )}

        {/* Шаг 2: в подвале осталась только отмена платежа. Закрытие окна
            переехало в тело кнопкой «Готово» — оно стоит сразу под реквизитами,
            где человек и заканчивает, а держать внизу вторую кнопку про то же
            самое значило бы спрашивать одно и то же дважды. */}
        {intent && !paid && !dead && (
          <DialogFooter>
            <Button
              variant="bare"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(intent.id, { onSuccess: close })}
            >
              {t('cancelPayment')}
            </Button>
          </DialogFooter>
        )}

        {(paid || dead) && (
          <DialogFooter>
            <Button variant="bare" onClick={reset}>
              {t('again')}
            </Button>
            <Button variant="solid" onClick={close}>
              {tc('close')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
