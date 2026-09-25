'use client';

import { cn } from '@/shared/lib/utils/css';
import { Button } from '@/shared/ui/Button';

/** Переключатель под столом: «Пропустить раздачу», «Сброс на любую ставку», «Пропускать раунды». */
export function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <Button variant="none" className={cn('ct-toggle', on && 'on')} aria-pressed={on} onClick={onClick}>
      <span className="ct-dot" aria-hidden />
      {label}
    </Button>
  );
}
