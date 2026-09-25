'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import { useJoinTable } from '@/entities/game-table';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';

/**
 * Посадка: сколько монет взять за стол. Вилку задал создатель стола; сверху
 * её режет ещё и баланс — предложить сумму, которой нет, значило бы получить
 * отказ сервера на кнопке, которая выглядела рабочей.
 */
export function BuyInDialog({
  tableId,
  min,
  max,
  onClose,
}: {
  tableId: string;
  min: number;
  max: number;
  onClose: () => void;
}) {
  const t = useTranslations('cardTable');
  const tc = useTranslations('coins');
  const join = useJoinTable();
  const { data: coins } = useCoinBalance();
  const cap = Math.min(max, coins?.balance ?? max);
  const [amount, setAmount] = useState(() => Math.max(min, Math.min(cap, min * 5)));
  const enough = cap >= min;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent tone="game">
        <DialogHeader title={t('buyInTitle')} subtitle={t('buyInLead', { min, max, unit: tc('unit') })} />
        <DialogBody>
          <Field label={t('buyInLabel')}>
            {(id) => (
              <Input
                id={id}
                full
                suffix={tc('unit')}
                inputMode="numeric"
                value={String(amount)}
                disabled={!enough}
                onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
              />
            )}
          </Field>
          {enough && min < cap && (
            <Slider value={amount} min={min} max={cap} onChange={setAmount} aria-label={t('buyInLabel')} />
          )}
          <p className={enough ? 'fhint' : 'fhint neg'}>
            {enough ? t('balance', { n: coins?.balance ?? 0, unit: tc('unit') }) : t('notEnoughCoins', { n: min, unit: tc('unit') })}
          </p>
          <ErrorNote error={join.error} fallback={t('joinFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={join.isPending ? t('sitting') : t('sit')}
          confirmDisabled={!enough || amount < min || amount > cap || join.isPending}
          onConfirm={() => join.mutate({ id: tableId, buyIn: amount }, { onSuccess: onClose })}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
