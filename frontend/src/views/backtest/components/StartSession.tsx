'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { FieldGroup, Input } from '@/shared/ui/Field';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { useCreateSession, type DataSource } from '@/widgets/backtest-session';

type Visibility = 'show' | 'hide';

/**
 * Параметры новой сессии. Дата по умолчанию скрыта: «это март 2020» — и трейдер
 * уже помнит, куда пошла цена. Цена по умолчанию видна: условная шкала от 100
 * до 1000 непривычна, и включать её — осознанный выбор. У тренажёра даты
 * вымышленные, поэтому поля «Дата» у него нет — сервер скрывает её сам.
 */
export function StartSession({ onStarted }: { onStarted: (id: string) => void }) {
  const t = useTranslations('backtest');
  const [market, setMarket] = useState<DataSource>('real');
  const [deposit, setDeposit] = useState('10000');
  const [date, setDate] = useState<Visibility>('hide');
  const [price, setPrice] = useState<Visibility>('show');
  const create = useCreateSession();

  const synthetic = market === 'synthetic';
  const depositN = Number(deposit);
  const valid = depositN >= 100 && depositN <= 10_000_000;
  const markets: SegOption<DataSource>[] = [
    { value: 'real', label: t('marketReal') },
    { value: 'synthetic', label: t('marketSynthetic') },
  ];
  const visibility: SegOption<Visibility>[] = [
    { value: 'show', label: t('show') },
    { value: 'hide', label: t('hide') },
  ];

  return (
    <section data-tour="bt-start">
      <SectionHead title={t('startTitle')} />
      <FieldGroup label={t('market')}>
        <Seg options={markets} value={market} onChange={setMarket} ariaLabel={t('market')} />
      </FieldGroup>
      <p className="muted" style={{ fontSize: 'var(--t-m)' }}>{synthetic ? t('syntheticLead') : t('startLead')}</p>
      {/* Без отдельной строки-подписи над полем: «Депозит» встаёт прямо в него,
          слева, тем же приёмом, что USDT справа, — полю есть чем назвать себя
          самому. aria-label держит имя для скринридера взамен снятого <label>. */}
      <Input
        full
        prefix={t('deposit')}
        suffix="USDT"
        aria-label={t('deposit')}
        inputMode="decimal"
        value={deposit}
        onChange={(e) => setDeposit(e.target.value)}
        style={{ marginTop: 'var(--s4)', marginBottom: 'var(--s3)' }}
      />
      {!synthetic && (
        <FieldGroup label={t('date')}>
          <Seg options={visibility} value={date} onChange={setDate} ariaLabel={t('date')} />
        </FieldGroup>
      )}
      <FieldGroup label={t('price')}>
        <Seg options={visibility} value={price} onChange={setPrice} ariaLabel={t('price')} />
      </FieldGroup>
      <Button
        variant="solid"
        disabled={!valid || create.isPending}
        onClick={() =>
          create.mutate(
            { startBalance: depositN, dataSource: market, hideDate: synthetic || date === 'hide', hidePrice: price === 'hide' },
            { onSuccess: (r) => onStarted(r.session.id) },
          )
        }
      >
        {create.isPending ? t(synthetic ? 'startingSynthetic' : 'starting') : t('start')}
      </Button>
      <ErrorNote error={create.error} fallback={t('startFailed')} />
    </section>
  );
}
