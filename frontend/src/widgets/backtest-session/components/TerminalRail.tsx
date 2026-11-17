'use client';

import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownUp, List } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';
import type { RailPanel } from '../model/useChartSettings';

/**
 * Рейка у правого края терминала, как у TradingView: иконка — панель справа.
 * Нажатие на неактивную открывает её, на активную — сворачивает колонку, и
 * график забирает её ширину. «Монеты» — только где монет несколько (`watch`).
 */
export function TerminalRail({
  value,
  watch,
  onChange,
}: {
  value: RailPanel;
  watch: boolean;
  onChange: (next: RailPanel) => void;
}) {
  const t = useTranslations('backtest');
  const item = (id: Exclude<RailPanel, 'none'>, Icon: ComponentType<{ size?: number }>) => (
    <Button
      variant="bare"
      className={cn('rail-btn', value === id && 'on')}
      aria-pressed={value === id}
      aria-label={t(`rail.${id}`)}
      title={t(`rail.${id}`)}
      onClick={() => onChange(value === id ? 'none' : id)}
    >
      <Icon size={20} />
    </Button>
  );
  return (
    <nav className="term-rail" aria-label={t('rail.label')}>
      {item('order', ArrowDownUp)}
      {watch && item('watch', List)}
    </nav>
  );
}
