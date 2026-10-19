'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Seg } from '@/shared/ui/Seg';
import { useHlOrders, type HlPosition, type HlWalletRow } from '../api/hooks';
import { OrdersTable } from './ActivityTables';
import { TradesPanel } from './TradesPanel';
import { NoteField } from './NoteField';
import { PositionsTable } from './PositionsTable';

type Tab = 'positions' | 'orders' | 'fills';

/**
 * Раскрытая строка сохранённого кошелька: заметка и три вкладки — открытые
 * позиции, ордера, история сделок. Позиции уже загружены страницей (общий
 * опрос раз в 30 с), ордера и сделки идут запросом, только пока открыта их вкладка.
 */
export function WalletDetail({
  row,
  positions,
  positionsLoading,
}: {
  row: HlWalletRow;
  positions: HlPosition[];
  positionsLoading: boolean;
}) {
  const t = useTranslations('hlWallets');
  const [tab, setTab] = useState<Tab>('positions');
  const orders = useHlOrders(row.address, tab === 'orders');

  return (
    <div style={{ padding: 'var(--s3) 0' }}>
      <NoteField address={row.address} note={row.note} />
      <div style={{ margin: 'var(--s3) 0' }}>
        <Seg
          options={[
            { value: 'positions', label: t('tabPositions') },
            { value: 'orders', label: t('tabOrders') },
            { value: 'fills', label: t('tabFills') },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel={t('tabsAria')}
        />
      </div>
      {tab === 'positions' ? (
        <PositionsTable rows={positions.filter((p) => p.address === row.address)} isLoading={positionsLoading} />
      ) : null}
      {tab === 'orders' ? (
        <>
          <ErrorNote error={orders.error} fallback={t('loadFailed')} />
          <OrdersTable rows={orders.data?.orders ?? []} isLoading={orders.isLoading} />
        </>
      ) : null}
      {tab === 'fills' ? <TradesPanel address={row.address} /> : null}
    </div>
  );
}
