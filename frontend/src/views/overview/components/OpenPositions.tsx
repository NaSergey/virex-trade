'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useOpenPositions,
  useOpenPositionContext,
  type ExchangePosition,
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
import { useRangeTf, useRangeTfOptions, type RangeTfPref } from '../model/useRangeTf';
import { formatPriceGrouped, formatQty, durationUnitLabels } from '@/shared/lib/utils/format';
import { useLocaleControl } from '@/shared/i18n';

interface TaggingTarget {
  symbol: string;
  direction: 'long' | 'short';
  unrealisedPnl: number;
  tagIds: string[];
}

/** Возраст позиции по нашим часам (см. openedAt в usePositionTags). */
function fmtAge(iso: string | null | undefined, units: { d: string; h: string; m: string }): string {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d} ${units.d} ${h} ${units.h}`;
  return h > 0 ? `${h} ${units.h} ${String(min % 60).padStart(2, '0')} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Ячейка возраста. Отдельным компонентом, потому что тянет свои данные: время
 * открытия знает не биржа (её `createdTime` не сбрасывается на новую позицию),
 * а наши часы — тот же запрос, что отдаёт теги позиции.
 */
function AgeCell({ position }: { position: ExchangePosition }) {
  const { data } = usePositionTags(position.symbol, position.direction);
  const { locale } = useLocaleControl();
  return <span className="muted">{fmtAge(data?.openedAt, durationUnitLabels(locale))}</span>;
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
function RangeCell({ position, rangeTf }: { position: ExchangePosition; rangeTf: RangeTfPref }) {
  const { data } = useOpenPositionContext(position.symbol, position.direction);
  const ctx = data?.context;
  const rows = rangeTf === 'all' ? RANGE_ROWS : RANGE_ROWS.filter((r) => r.key === rangeTf);
  return (
    <RangeScale
      rows={rows.map((r) => ({ tf: r.label, value: ctx ? r.pick(ctx) : null }))}
    />
  );
}

function TagsCell({ position, onEdit }: { position: ExchangePosition; onEdit: (t: TaggingTarget) => void }) {
  const t = useTranslations('overview');
  const direction = position.direction;
  const { data } = usePositionTags(position.symbol, direction);
  const tags = data?.tags ?? [];
  const pnl = parseFloat(position.unrealisedPnl ?? '') || 0;

  return (
    <Tags tags={tags}>
      <Button
        variant="add"
        onClick={() => onEdit({ symbol: position.symbol, direction, unrealisedPnl: pnl, tagIds: tags.map((tg) => tg.id) })}
      >
        {tags.length === 0 ? t('addTag') : '+'}
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
  const t = useTranslations('overview');
  const rangeTfOptions = useRangeTfOptions();
  const [tagging, setTagging] = useState<TaggingTarget | null>(null);
  const { rangeTf, setRangeTf } = useRangeTf();
  const { data } = useOpenPositions();

  const positions = (data?.positions ?? []).filter((p) => parseFloat(p.size) > 0);
  if (positions.length === 0) return null;

  const totalPnl = positions.reduce((s, p) => s + (parseFloat(p.unrealisedPnl ?? '') || 0), 0);

  const columns: LedgerColumn<ExchangePosition>[] = [
    { key: 'symbol', header: t('colSymbol'), render: (p) => <span className="sym">{p.symbol}</span> },
    {
      key: 'direction',
      header: t('colDirection'),
      render: (p) => <span className={`dir${p.direction === 'short' ? ' short' : ''}`}>{p.direction}</span>,
    },
    {
      key: 'size',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      // Как и у закрытых сделок — деньгами. Номинал биржа считает сама
      // (positionValue), пересчитывать его из размера и цены незачем.
      render: (p) => <span title={t('qtyTitle', { qty: formatQty(p.size) })}>{formatPriceGrouped(p.positionValue)}</span>,
    },
    {
      key: 'entry',
      header: t('colEntry'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => formatPriceGrouped(p.avgPrice),
    },
    {
      key: 'mark',
      header: t('colMark'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => formatPriceGrouped(p.markPrice),
    },
    {
      key: 'liq',
      header: t('colLiq'),
      align: 'right',
      cellClassName: 'n neg',
      render: (p) => (parseFloat(p.liqPrice ?? '') > 0 ? formatPriceGrouped(p.liqPrice) : '—'),
    },
    {
      key: 'age',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => <AgeCell position={p} />,
    },
    {
      key: 'range',
      header: t('colRangeEntry'),
      width: 150,
      render: (p) => <RangeCell position={p} rangeTf={rangeTf} />,
    },
    {
      key: 'pnl',
      header: t('colUnrealizedPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => <Money value={parseFloat(p.unrealisedPnl ?? '') || 0} large />,
    },
    {
      key: 'tags',
      header: t('colTags'),
      cellClassName: 'cell-tags',
      render: (p) => <TagsCell position={p} onEdit={setTagging} />,
    },
  ];

  return (
    <div className="now">
      <Wrap>
        <SectionHead title={t('openPositionsTitle')}>
          <Seg
            options={rangeTfOptions}
            value={rangeTf}
            onChange={setRangeTf}
            className="seg-tight"
            ariaLabel={t('rangeScaleAriaLabel')}
          />
          <Money value={totalPnl} unit="USDT" className="n" />
        </SectionHead>
        <LedgerTable
          columns={columns}
          rows={positions}
          rowKey={(p) => `${p.symbol}-${p.direction}`}
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
