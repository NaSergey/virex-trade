'use client';

import { useTranslations } from 'next-intl';
import { useSlotsConfig } from '@/entities/slots';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Machine } from './components/Machine';
import { SlotDefs } from '@/shared/ui/SlotSymbols';
import './slots.css';

/**
 * Слоты — /games/slots. Против заведения, без столов и лобби: спин — один
 * запрос, исход решает сервер, экран его проигрывает. Правила (линии,
 * выплаты, ставки) приходят с сервера.
 */
export function SlotsPage() {
  const t = useTranslations('slots');
  const { data: config, error, isLoading } = useSlotsConfig();
  return (
    <div className="sl-root">
      <SlotDefs />
      {config ? (
        <Machine config={config} />
      ) : isLoading ? (
        <p className="sl-wait">{t('loading')}</p>
      ) : (
        <ErrorNote error={error} fallback={t('loadFailed')} />
      )}
    </div>
  );
}
