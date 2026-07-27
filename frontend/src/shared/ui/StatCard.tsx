'use client';

import { memo, type ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: string;
  containerClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  extra?: ReactNode;
}

const DEFAULT_CONTAINER_CLASS = 'rounded-lg border border-line bg-surface p-3';
const DEFAULT_LABEL_CLASS = 'mb-1 text-xs text-muted';
const DEFAULT_VALUE_CLASS = 'font-mono text-lg font-semibold text-fg';

export const StatCard = memo(
  ({ label, value, containerClassName, labelClassName, valueClassName, extra }: StatCardProps) => (
    <div className={containerClassName ?? DEFAULT_CONTAINER_CLASS}>
      <div className={labelClassName ?? DEFAULT_LABEL_CLASS}>{label}</div>
      <div className={valueClassName ?? DEFAULT_VALUE_CLASS}>{value}</div>
      {extra}
    </div>
  ),
);

StatCard.displayName = 'StatCard';
