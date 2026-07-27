'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useOpenPositions, useOpenPositionContext, type BybitPosition } from '@/shared/api/bybit/hooks';
import { usePositionTags } from '@/shared/api/tags/hooks';
import { TagChip } from '@/shared/ui/TagChip';
import { TermWindow } from '@/page/stats/TermWindow';
import { PositionTagsModal } from '@/page/stats/PositionTagsModal';
import { formatPnl, formatPrice, pnlColor } from '@/shared/lib/utils/format';
import { formatRangePos, rangePosColor } from '@/shared/lib/utils/range';

/** Что открыто прямо сейчас: одна строка на позицию. */
interface TaggingTarget {
  symbol: string;
  direction: 'long' | 'short';
  unrealisedPnl: number;
  tagIds: string[];
}

/** Возраст позиции по нашим часам (см. openedAt в usePositionTags). */
function fmtAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return null;
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  return h > 0 ? `${h}ч ${min % 60}м` : `${min}м`;
}

/** Ячейка «подпись сверху, значение снизу» — тот же ритм, что у мастхеда. */
function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] tracking-wide text-subtle uppercase">{label}</span>
      <span className={className ?? 'font-mono text-xs text-fg'}>{value}</span>
    </div>
  );
}

function PositionRow({
  position,
  onEditTags,
}: {
  position: BybitPosition;
  onEditTags: (t: TaggingTarget) => void;
}) {
  const direction: 'long' | 'short' = position.side === 'Buy' ? 'long' : 'short';
  const { data } = usePositionTags(position.symbol, direction);
  const { data: ctxData } = useOpenPositionContext(position.symbol, direction);
  const tags = data?.tags ?? [];
  // Снимок входа считается синком в первый тик после открытия, поэтому пару
  // минут после входа его ещё нет — тогда показываем прочерк, а не пустоту.
  const ctx = ctxData?.context;

  const pnl = parseFloat(position.unrealisedPnl) || 0;
  const leverage = parseFloat(position.leverage) || 0;
  const value = parseFloat(position.positionValue) || 0;
  // ROI считаем от начальной маржи (объём / плечо), а не от объёма: positionIM
  // приходит не во всех режимах счёта, а эти два поля есть всегда.
  const margin = leverage > 0 ? value / leverage : 0;
  const roi = margin > 0 ? (pnl / margin) * 100 : null;
  const age = fmtAge(data?.openedAt);
  const liq = parseFloat(position.liqPrice);
  const tp = parseFloat(position.takeProfit);
  const sl = parseFloat(position.stopLoss);
  const isLong = direction === 'long';

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-3.5 py-3 first:border-t-0">
      <div className="flex min-w-38 items-center gap-2">
        <span className="text-sm font-semibold text-fg">{position.symbol}</span>
        <span className={`text-[11px] font-bold ${isLong ? 'text-up' : 'text-down'}`}>
          {isLong ? 'LONG' : 'SHORT'}
        </span>
        {leverage > 0 && (
          <span className="rounded bg-elevated px-1 py-px font-mono text-[10px] text-muted">
            ×{leverage}
          </span>
        )}
      </div>

      <Cell label="размер" value={position.size} />
      <Cell label="вход" value={formatPrice(position.avgPrice)} />
      <Cell label="марк" value={formatPrice(position.markPrice)} />
      <Cell label="ликвидация" value={liq > 0 ? formatPrice(liq) : '—'} />
      <Cell
        label="tp / sl"
        value={`${tp > 0 ? formatPrice(tp) : '—'} / ${sl > 0 ? formatPrice(sl) : '—'}`}
      />
      {age && <Cell label="в позиции" value={age} />}
      {/* Контекст входа, посчитанный в момент открытия: сразу видно, взял по
          верхам диапазона или по низам — не дожидаясь, пока сделка закроется
          и попадёт в статистику. */}
      <Cell
        label="диапазон 4h"
        value={ctx?.ok ? formatRangePos(ctx.rangePos4h) : ctx?.ok === false ? 'нет истории' : '…'}
        className={`font-mono text-xs font-semibold ${
          ctx?.ok ? rangePosColor(ctx.rangePos4h, direction) : 'text-subtle'
        }`}
      />
      {ctx?.ok && (
        <Cell
          label="диапазон 1h / d"
          value={`${formatRangePos(ctx.rangePos1h)} · ${formatRangePos(ctx.rangePos1d)}`}
          className="font-mono text-[11px] text-muted"
        />
      )}
      <Cell
        label="нереализ. p&l"
        value={`${formatPnl(pnl)} USDT${roi != null ? ` (${formatPnl(roi)}%)` : ''}`}
        className={`font-mono text-[13px] font-bold ${pnlColor(pnl)}`}
      />

      <button
        onClick={() =>
          onEditTags({ symbol: position.symbol, direction, unrealisedPnl: pnl, tagIds: tags.map((t) => t.id) })
        }
        title="Разметить позицию тегами"
        className="ml-auto inline-flex cursor-pointer flex-wrap items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-elevated"
      >
        {tags.length === 0 ? (
          <span className="text-xs text-subtle">Добавить теги</span>
        ) : (
          tags.map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)
        )}
        <Pencil className="h-3 w-3 shrink-0 text-muted" />
      </button>
    </div>
  );
}

/**
 * Открытые сейчас позиции на «Обзоре». Таблица ниже показывает только закрытые
 * сделки (они приходят из closed-pnl), поэтому текущая позиция раньше нигде не
 * была видна — и разметить её тегами на входе, пока сетап ещё в голове, было
 * негде, хотя бэкенд это умеет с самого начала (PositionTag).
 *
 * Когда открытых позиций нет, блок не рендерится вовсе: пустая рамка на
 * половину экрана в «Обзоре» не несёт смысла.
 */
export function OpenPositions() {
  const [tagging, setTagging] = useState<TaggingTarget | null>(null);
  const { data } = useOpenPositions();

  const positions = (data?.positions ?? []).filter((p) => parseFloat(p.size) > 0);
  if (positions.length === 0) return null;

  const totalPnl = positions.reduce((s, p) => s + (parseFloat(p.unrealisedPnl) || 0), 0);

  return (
    <section className="mt-3">
      <TermWindow tight>
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" />
          </span>
          <span className="text-[10px] font-medium tracking-wide text-muted uppercase">
            В рынке · {positions.length}
          </span>
          <span className={`ml-auto font-mono text-xs font-bold ${pnlColor(totalPnl)}`}>
            {formatPnl(totalPnl)} USDT
          </span>
        </div>

        {positions.map((p) => (
          <PositionRow key={`${p.symbol}-${p.side}`} position={p} onEditTags={setTagging} />
        ))}
      </TermWindow>

      {tagging && (
        <PositionTagsModal
          symbol={tagging.symbol}
          direction={tagging.direction}
          unrealisedPnl={tagging.unrealisedPnl}
          initialTagIds={tagging.tagIds}
          onClose={() => setTagging(null)}
        />
      )}
    </section>
  );
}
