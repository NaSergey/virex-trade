'use client';

import { useState } from 'react';
import { useOpenPositions, useOpenPositionContext, type BybitPosition } from '@/shared/api/bybit/hooks';
import { usePositionTags } from '@/shared/api/tags/hooks';
import { Tags } from '@/shared/ui/Tag';
import { Wrap } from '@/shared/ui/Wrap';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { RangeScale } from '@/page/stats/RangeScale';
import { PositionTagsModal } from '@/page/stats/PositionTagsModal';
import { formatMoney, formatPriceGrouped, moneyClass } from '@/shared/lib/utils/format';

interface TaggingTarget {
  symbol: string;
  direction: 'long' | 'short';
  unrealisedPnl: number;
  tagIds: string[];
}

const directionOf = (p: BybitPosition): 'long' | 'short' => (p.side === 'Buy' ? 'long' : 'short');

/** Возраст позиции по нашим часам (см. openedAt в usePositionTags). */
function fmtAge(iso: string | null | undefined): string {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d} д ${h} ч`;
  return h > 0 ? `${h} ч ${String(min % 60).padStart(2, '0')} м` : `${min} м`;
}

/**
 * Ячейка возраста. Отдельным компонентом, потому что тянет свои данные: время
 * открытия знает не биржа (её `createdTime` не сбрасывается на новую позицию),
 * а наши часы — тот же запрос, что отдаёт теги позиции.
 */
function AgeCell({ position }: { position: BybitPosition }) {
  const { data } = usePositionTags(position.symbol, directionOf(position));
  return <span style={{ color: 'var(--color-muted)' }}>{fmtAge(data?.openedAt)}</span>;
}

/**
 * Шкала «вход в диапазоне» по трём таймфреймам. Снимок входа считается синком в
 * первый тик после открытия — пару минут после входа его ещё нет, и тогда шкала
 * стоит пустой, а не показывает ноль.
 */
function RangeCell({ position }: { position: BybitPosition }) {
  const { data } = useOpenPositionContext(position.symbol, directionOf(position));
  const ctx = data?.context;
  return (
    <RangeScale
      rows={[
        { tf: '1H', value: ctx?.rangePos1h ?? null },
        { tf: '4H', value: ctx?.rangePos4h ?? null },
        { tf: 'D', value: ctx?.rangePos1d ?? null },
      ]}
    />
  );
}

function TagsCell({ position, onEdit }: { position: BybitPosition; onEdit: (t: TaggingTarget) => void }) {
  const direction = directionOf(position);
  const { data } = usePositionTags(position.symbol, direction);
  const tags = data?.tags ?? [];
  const pnl = parseFloat(position.unrealisedPnl) || 0;

  return (
    <Tags tags={tags}>
      <button
        className="tag-add"
        onClick={() => onEdit({ symbol: position.symbol, direction, unrealisedPnl: pnl, tagIds: tags.map((t) => t.id) })}
      >
        {tags.length === 0 ? '+ тег' : '+'}
      </button>
    </Tags>
  );
}

/**
 * Что открыто прямо сейчас. Это единственная заливка на весь продукт: контраст
 * по роду, а не по степени — «сейчас» отличается от «истории» не яркостью
 * рамки, а тем, что лежит на другой бумаге.
 *
 * Таблица ниже показывает только закрытые сделки (они приходят из closed-pnl),
 * поэтому разметить открытую позицию тегами, пока сетап ещё в голове, можно
 * только здесь. Когда открытых позиций нет — полосы нет вовсе.
 */
export function OpenPositions() {
  const [tagging, setTagging] = useState<TaggingTarget | null>(null);
  const { data } = useOpenPositions();

  const positions = (data?.positions ?? []).filter((p) => parseFloat(p.size) > 0);
  if (positions.length === 0) return null;

  const totalPnl = positions.reduce((s, p) => s + (parseFloat(p.unrealisedPnl) || 0), 0);

  const columns: LedgerColumn<BybitPosition>[] = [
    { key: 'symbol', header: 'Символ', render: (p) => <span className="sym">{p.symbol}</span> },
    {
      key: 'direction',
      header: 'Напр.',
      render: (p) => <span className={`dir${directionOf(p) === 'short' ? ' short' : ''}`}>{directionOf(p)}</span>,
    },
    { key: 'size', header: 'Размер', align: 'right', cellClassName: 'n', render: (p) => p.size },
    {
      key: 'entry',
      header: 'Вход',
      align: 'right',
      cellClassName: 'n',
      render: (p) => formatPriceGrouped(p.avgPrice),
    },
    {
      key: 'mark',
      header: 'Маркировка',
      align: 'right',
      cellClassName: 'n',
      render: (p) => formatPriceGrouped(p.markPrice),
    },
    {
      key: 'liq',
      header: 'Ликвидация',
      align: 'right',
      cellClassName: 'n neg',
      render: (p) => (parseFloat(p.liqPrice) > 0 ? formatPriceGrouped(p.liqPrice) : '—'),
    },
    {
      key: 'age',
      header: 'В позиции',
      align: 'right',
      cellClassName: 'n',
      render: (p) => <AgeCell position={p} />,
    },
    { key: 'range', header: 'Вход в диапазоне', width: 150, render: (p) => <RangeCell position={p} /> },
    {
      key: 'pnl',
      header: 'Нереализ. P&L',
      align: 'right',
      cellClassName: 'n',
      render: (p) => {
        const pnl = parseFloat(p.unrealisedPnl) || 0;
        return (
          <span className={moneyClass(pnl)} style={{ fontSize: 'var(--t-m)' }}>
            {formatMoney(pnl)}
          </span>
        );
      },
    },
    {
      key: 'tags',
      header: 'Теги',
      cellClassName: 'cell-tags',
      render: (p) => <TagsCell position={p} onEdit={setTagging} />,
    },
  ];

  return (
    <div className="now">
      <Wrap>
        <div className="h2row">
          <h2>Открытые позиции — сейчас</h2>
          <span className={`n ${moneyClass(totalPnl)}`}>{formatMoney(totalPnl)} USDT</span>
        </div>
        <LedgerTable
          columns={columns}
          rows={positions}
          rowKey={(p) => `${p.symbol}-${p.side}`}
        />
      </Wrap>

      {tagging && (
        <PositionTagsModal
          symbol={tagging.symbol}
          direction={tagging.direction}
          unrealisedPnl={tagging.unrealisedPnl}
          initialTagIds={tagging.tagIds}
          onClose={() => setTagging(null)}
        />
      )}
    </div>
  );
}
