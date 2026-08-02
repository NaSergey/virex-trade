'use client';

import { useState } from 'react';
import {
  useOpenPositions,
  useOpenPositionContext,
  type BybitPosition,
  type OpenPositionContext,
} from '@/entities/position';
import { usePositionTags, Tags } from '@/entities/tag';
import { Wrap } from '@/shared/ui/Wrap';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg } from '@/shared/ui/Seg';
import { Money } from '@/shared/ui/Money';
import { RangeScale } from './RangeScale';
import { PositionTagsModal } from './PositionTagsModal';
import { useRangeTf, RANGE_TF_OPTIONS, type RangeTfPref } from '../model/useRangeTf';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';

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
  return <span className="muted">{fmtAge(data?.openedAt)}</span>;
}

/** Порядок горизонтов на шкале — от короткого к длинному, как в тумблере. */
const RANGE_ROWS = [
  { key: '1h' as const, label: '1H', pick: (c: OpenPositionContext) => c.rangePos1h },
  { key: '4h' as const, label: '4H', pick: (c: OpenPositionContext) => c.rangePos4h },
  { key: '1d' as const, label: 'D', pick: (c: OpenPositionContext) => c.rangePos1d },
];

/**
 * Шкала «вход в диапазоне». Снимок входа считается синком в первый тик после
 * открытия — пару минут после входа его ещё нет, и тогда шкала стоит пустой, а
 * не показывает ноль.
 *
 * Сколько горизонтов показывать, решает тумблер в шапке раздела (см.
 * useRangeTf): один выбранный или все три.
 */
function RangeCell({ position, rangeTf }: { position: BybitPosition; rangeTf: RangeTfPref }) {
  const { data } = useOpenPositionContext(position.symbol, directionOf(position));
  const ctx = data?.context;
  const rows = rangeTf === 'all' ? RANGE_ROWS : RANGE_ROWS.filter((r) => r.key === rangeTf);
  return (
    <RangeScale
      rows={rows.map((r) => ({ tf: r.label, value: ctx ? r.pick(ctx) : null }))}
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
      <Button
        variant="add"
        onClick={() => onEdit({ symbol: position.symbol, direction, unrealisedPnl: pnl, tagIds: tags.map((t) => t.id) })}
      >
        {tags.length === 0 ? '+ тег' : '+'}
      </Button>
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
  const { rangeTf, setRangeTf } = useRangeTf();
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
    {
      key: 'size',
      header: 'Размер',
      align: 'right',
      cellClassName: 'n',
      // Как и у закрытых сделок — деньгами. Номинал биржа считает сама
      // (positionValue), пересчитывать его из размера и цены незачем.
      render: (p) => <span title={`${formatQty(p.size)} в монете`}>{formatPriceGrouped(p.positionValue)}</span>,
    },
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
    {
      key: 'range',
      header: 'Вход в диапазоне',
      width: 150,
      render: (p) => <RangeCell position={p} rangeTf={rangeTf} />,
    },
    {
      key: 'pnl',
      header: 'Нереализ. P&L',
      align: 'right',
      cellClassName: 'n',
      render: (p) => <Money value={parseFloat(p.unrealisedPnl) || 0} large />,
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
        <SectionHead title="Открытые позиции — сейчас">
          <Seg
            options={RANGE_TF_OPTIONS}
            value={rangeTf}
            onChange={setRangeTf}
            className="seg-tight"
            ariaLabel="Горизонт шкалы «вход в диапазоне»"
          />
          <Money value={totalPnl} unit="USDT" className="n" />
        </SectionHead>
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
