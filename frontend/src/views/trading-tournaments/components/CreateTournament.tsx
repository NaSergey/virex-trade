'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCoinBalance } from '@/entities/coins';
import { useCreateTournament, type TournamentVisibility } from '@/entities/tournament';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, FieldGroup, Input, Select } from '@/shared/ui/Field';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { defaultShares, sharesValid } from '../model/payout-shares';

const DURATIONS = [60, 240, 1440, 4320, 10080] as const;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

/**
 * Новый турнир. Дуэль и общий турнир — не разные сущности, а разные значения
 * тех же полей: два места, один победитель и доля в сто процентов — это и есть
 * дуэль.
 *
 * Доли по местам подставляются готовыми (см. `defaultShares`) и правятся
 * руками: начинать с пустых полей значило бы заставить создателя решать
 * арифметику «чтобы вышло сто» раньше, чем он подумал о турнире.
 */
export function CreateTournament({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useTranslations('tournaments');
  const tc = useTranslations('coins');
  const create = useCreateTournament();
  const { data: coins } = useCoinBalance();

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<TournamentVisibility>('private');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [deposit, setDeposit] = useState('10000');
  const [durationMin, setDurationMin] = useState<number>(240);
  const [entryFee, setEntryFee] = useState('100');
  const [prizeBonus, setPrizeBonus] = useState('0');
  const [winnersCount, setWinnersCount] = useState(1);
  const [shares, setShares] = useState<number[]>(() => defaultShares(1));

  const visibilityOptions: SegOption<TournamentVisibility>[] = [
    { value: 'private', label: t('visibilityPrivate') },
    { value: 'public', label: t('visibilityPublic') },
  ];
  const durationOptions: SegOption<number>[] = DURATIONS.map((m) => ({ value: m, label: t(`duration.${m}`) }));

  const depositN = Number(deposit);
  const feeN = Number(entryFee);
  const bonusN = Number(prizeBonus);
  const numbersOk =
    Number.isInteger(feeN) &&
    feeN >= 0 &&
    Number.isInteger(bonusN) &&
    bonusN >= 0 &&
    depositN >= 100 &&
    depositN <= 10_000_000;
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60;
  const valid = nameOk && numbersOk && sharesValid(shares, winnersCount) && winnersCount < maxPlayers;

  // Что создатель платит прямо сейчас: свой взнос и добавку в фонд.
  const dueNow = (numbersOk ? feeN : 0) + (numbersOk ? bonusN : 0);
  const notEnough = coins != null && dueNow > coins.balance;
  // Фонд при полном наборе мест — сколько турнир обещает, а не сколько собрал.
  const poolFull = numbersOk ? feeN * maxPlayers + bonusN : 0;

  // Мест стало меньше числа победителей — подвинуть победителей, иначе форма
  // молча оставалась бы невалидной без видимой причины.
  const applyMaxPlayers = (n: number) => {
    setMaxPlayers(n);
    if (winnersCount >= n) applyWinners(n - 1);
  };
  const applyWinners = (n: number) => {
    setWinnersCount(n);
    setShares(defaultShares(n));
  };

  return (
    <section>
      <SectionHead title={t('createTitle')} />
      <p className="muted" style={{ fontSize: 'var(--t-m)' }}>{t('createLead')}</p>

      <Field label={t('nameLabel')}>
        {(id) => <Input id={id} full value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
      </Field>

      <FieldGroup label={t('visibilityLabel')}>
        <Seg options={visibilityOptions} value={visibility} onChange={setVisibility} ariaLabel={t('visibilityLabel')} />
      </FieldGroup>
      <p className="subtle" style={{ fontSize: 'var(--t-xs)' }}>
        {visibility === 'public' ? t('visibilityPublicHint') : t('visibilityPrivateHint')}
      </p>

      <Field label={t('playersLabel')}>
        {(id) => (
          <Select id={id} full value={maxPlayers} onChange={(e) => applyMaxPlayers(Number(e.target.value))}>
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
              <option key={n} value={n}>
                {n === 2 ? t('playersDuel') : t('playersN', { n })}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('depositLabel')}>
        {(id) => (
          <Input id={id} full suffix="USDT" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        )}
      </Field>

      <FieldGroup label={t('durationLabel')}>
        <Seg options={durationOptions} value={durationMin} onChange={setDurationMin} ariaLabel={t('durationLabel')} />
      </FieldGroup>

      <Field label={t('entryFeeLabel')}>
        {(id) => (
          <Input
            id={id}
            full
            suffix={tc('unit')}
            inputMode="numeric"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
          />
        )}
      </Field>

      <Field label={t('prizeBonusLabel')}>
        {(id) => (
          <Input
            id={id}
            full
            suffix={tc('unit')}
            inputMode="numeric"
            value={prizeBonus}
            onChange={(e) => setPrizeBonus(e.target.value)}
          />
        )}
      </Field>

      <Field label={t('winnersLabel')}>
        {(id) => (
          <Select id={id} full value={winnersCount} onChange={(e) => applyWinners(Number(e.target.value))}>
            {Array.from({ length: maxPlayers - 1 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <FieldGroup label={t('sharesLabel')}>
        <div className="shares">
          {shares.map((share, i) => (
            <label key={i} className="share">
              <span className="lbl">{t('placeN', { n: i + 1 })}</span>
              <Input
                suffix="%"
                inputMode="numeric"
                value={String(share)}
                onChange={(e) => {
                  const next = [...shares];
                  next[i] = Number(e.target.value.replace(/\D/g, '')) || 0;
                  setShares(next);
                }}
              />
            </label>
          ))}
        </div>
      </FieldGroup>
      {!sharesValid(shares, winnersCount) && <p className="neg">{t('sharesInvalid')}</p>}

      <p className="muted">{t('poolPreview', { n: poolFull, unit: tc('unit') })}</p>
      {notEnough && <p className="neg">{t('notEnoughCoins', { n: dueNow, unit: tc('unit') })}</p>}

      <Button
        variant="solid"
        disabled={!valid || notEnough || create.isPending}
        onClick={() =>
          create.mutate(
            {
              name: name.trim(),
              visibility,
              maxPlayers,
              startBalance: depositN,
              durationMin,
              entryFee: feeN,
              prizeBonus: bonusN,
              winnersCount,
              payoutShares: shares,
            },
            { onSuccess: (r) => onCreated(r.tournament.id) },
          )
        }
      >
        {create.isPending ? t('creating') : t('create')}
      </Button>
      <ErrorNote error={create.error} fallback={t('createFailed')} />
    </section>
  );
}
