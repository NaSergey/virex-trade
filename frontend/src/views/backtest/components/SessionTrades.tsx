'use client';

import { useTranslations } from 'next-intl';
import { TagPicker, type TagItem } from '@/entities/tag';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { formatR, toScreen } from '../lib/money';

/**
 * Сделки сессии, свежие сверху. Строка раскрывается выбором тегов — тем же
 * TagPicker, что в журнале: теги пользователя одни, сделки разные.
 */
export function SessionTrades({
  trades,
  scale,
  labelFor,
  tags,
  onSetTags,
}: {
  trades: BacktestTrade[];
  /** Масштаб показа; у завершённой сессии — 1, цены раскрыты. */
  scale: number;
  labelFor: (t: number) => string;
  tags: TagItem[];
  onSetTags: (tradeId: string, tagIds: string[]) => void;
}) {
  const t = useTranslations('backtest');
  const price = (p: number) => formatPriceGrouped(toScreen(p, scale));

  const columns: LedgerColumn<BacktestTrade>[] = [
    { key: 'dir', header: t('colDir'), render: (x) => t(`direction.${x.direction}`) },
    {
      key: 'entry',
      header: t('colEntry'),
      cellClassName: 'n',
      render: (x) => `${labelFor(Date.parse(x.entryTime))} · ${price(x.entryPrice)}`,
    },
    {
      key: 'exit',
      header: t('colExit'),
      cellClassName: 'n',
      render: (x) => (x.exitTime && x.exitPrice != null ? `${labelFor(Date.parse(x.exitTime))} · ${price(x.exitPrice)}` : '—'),
    },
    { key: 'reason', header: t('colReason'), render: (x) => t(`reason.${x.exitReason ?? 'open'}`) },
    {
      key: 'r',
      header: t('colR'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.r != null ? <span className={x.r >= 0 ? 'pos' : 'neg'}>{formatR(x.r)}</span> : '—'),
    },
    {
      key: 'pnl',
      header: t('colPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.pnl != null ? <Money value={x.pnl} /> : '—'),
    },
    {
      key: 'tags',
      header: t('colTags'),
      cellClassName: 'cell-tags',
      render: (x) => (x.tags.length ? x.tags.map((g) => g.name).join(', ') : <span className="muted">—</span>),
    },
  ];

  return (
    <section>
      <SectionHead title={t('tradesTitle')} />
      <LedgerTable
        columns={columns}
        rows={[...trades].reverse()}
        rowKey={(x) => x.id}
        empty={t('noTrades')}
        renderExpanded={(x) => {
          const selected = new Set(x.tags.map((g) => g.id));
          return (
            <TagPicker
              tags={tags}
              selected={selected}
              onToggle={(id) => {
                const next = new Set(selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                onSetTags(x.id, [...next]);
              }}
            />
          );
        }}
      />
    </section>
  );
}
