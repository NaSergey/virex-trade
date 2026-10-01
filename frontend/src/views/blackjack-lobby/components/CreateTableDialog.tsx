'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCreateTable, type TableVisibility } from '@/entities/game-table';
import { CoinIcon } from '@/shared/ui/CoinIcon';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input, Select } from '@/shared/ui/Field';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';

/** Границы — те же, что проверяет сервер (`games.config.ts`). */
const MIN_SEATS = 1;
const MAX_SEATS = 7;
const MIN_BET = 2;

/**
 * Новый стол блэкджека. Buy-in по умолчанию — от 20 до 100 минимальных
 * ставок: подставляется от ставки, пока создатель не тронул его сам (тот же
 * приём, что блайнды покера).
 */
export function CreateTableDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('blackjack');
  const tt = useTranslations('cardTable');
  const create = useCreateTable();

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<TableVisibility>('private');
  const [maxSeats, setMaxSeats] = useState(MAX_SEATS);
  const [minBet, setMinBet] = useState('10');
  const [maxBet, setMaxBet] = useState('500');
  const [minBuyIn, setMinBuyIn] = useState('200');
  const [maxBuyIn, setMaxBuyIn] = useState('1000');
  const [buyInTouched, setBuyInTouched] = useState(false);

  const visibilityOptions: SegOption<TableVisibility>[] = [
    { value: 'private', label: tt('private') },
    { value: 'public', label: tt('public') },
  ];

  const minB = Number(minBet);
  const maxB = Number(maxBet);
  const minN = Number(minBuyIn);
  const maxN = Number(maxBuyIn);
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60;
  const betsOk = Number.isInteger(minB) && Number.isInteger(maxB) && minB >= MIN_BET && maxB >= minB;
  const buyInOk = Number.isInteger(minN) && Number.isInteger(maxN) && minN >= minB && maxN >= minN;
  const valid = nameOk && betsOk && buyInOk;

  const applyMinBet = (v: string) => {
    setMinBet(v);
    const n = Number(v);
    if (!buyInTouched && Number.isInteger(n) && n > 0) {
      setMinBuyIn(String(n * 20));
      setMaxBuyIn(String(n * 100));
    }
  };
  const touchBuyIn = (set: (v: string) => void) => (v: string) => {
    setBuyInTouched(true);
    set(v);
  };

  const submit = () =>
    create.mutate(
      {
        gameType: 'blackjack',
        name: name.trim(),
        visibility,
        maxSeats,
        minBet: minB,
        maxBet: maxB,
        minBuyIn: minN,
        maxBuyIn: maxN,
      },
      {
        onSuccess: (table) => {
          onClose();
          onCreated(table.id);
        },
      },
    );

  const coinInput = (value: string, onChange: (v: string) => void) =>
    function CoinInput(id: string) {
      return (
        <Input id={id} full suffix={<CoinIcon />} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
      );
    };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent tone="game">
        <DialogHeader title={tt('createTitle')} subtitle={t('createLead')} />
        <DialogBody>
          <Field label={tt('nameLabel')}>
            {(id) => <Input id={id} full value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
          </Field>
          <div className="field">
            <Seg options={visibilityOptions} value={visibility} onChange={setVisibility} ariaLabel={tt('visibilityLabel')} />
          </div>
          <div className="fgrid">
            <Field label={tt('seatsLabel')}>
              {(id) => (
                <Select id={id} full value={maxSeats} onChange={(e) => setMaxSeats(Number(e.target.value))}>
                  {Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => i + MIN_SEATS).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('minBetLabel')}>{coinInput(minBet, applyMinBet)}</Field>
            <Field label={t('maxBetLabel')}>{coinInput(maxBet, setMaxBet)}</Field>
            <Field label={tt('minBuyInLabel')}>{coinInput(minBuyIn, touchBuyIn(setMinBuyIn))}</Field>
            <Field label={tt('maxBuyInLabel')}>{coinInput(maxBuyIn, touchBuyIn(setMaxBuyIn))}</Field>
          </div>
          <p className={betsOk && buyInOk ? 'fhint' : 'fhint neg'}>
            {!betsOk
              ? t('betsInvalid')
              : buyInOk
                ? t('betsHint', { min: minB, max: maxB })
                : t('buyInInvalid', { n: minB })}
          </p>
          <ErrorNote error={create.error} fallback={tt('createFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={create.isPending ? tt('creating') : tt('create')}
          confirmDisabled={!valid || create.isPending}
          onConfirm={submit}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
