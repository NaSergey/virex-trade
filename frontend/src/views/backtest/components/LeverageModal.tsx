'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { Field } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';

const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 100;

/**
 * Выбор плеча — отдельный диалог, а не слайдер прямо на панели: тикет и так
 * плотный (риск, стоп, тейк), а плечо трогают не на каждой сделке. Один диалог на
 * два разных плеча: следующего ордера (панель) и открытых позиций (таблица позиций) —
 * что с выбранным значением делать, решает вызывающий в `onChange`/`onClose`.
 */
export function LeverageModal({
  leverage,
  subtitle,
  onChange,
  onClose,
}: {
  leverage: number;
  /** К чему применится — у следующего ордера и у открытых позиций это разное. */
  subtitle?: string;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('backtest');
  const tc = useTranslations('common');
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={t('leverageLabel')} subtitle={subtitle} />
        <DialogBody>
          <Field
            label={
              <span className="fld-head">
                <span>{t('leverageLabel')}</span>
                <span className="fld-val">{leverage.toFixed(0)}×</span>
              </span>
            }
          >
            {() => (
              <Slider
                value={leverage}
                min={MIN_LEVERAGE}
                max={MAX_LEVERAGE}
                step={1}
                onChange={onChange}
                aria-label={t('leverageLabel')}
              />
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="solid" onClick={onClose}>
            {tc('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
