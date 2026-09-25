'use client';

import { useTranslations } from 'next-intl';
import type { BjActionType, BjLegal } from '@/entities/game-table';
import { Button } from '@/shared/ui/Button';

const ACTIONS: BjActionType[] = ['hit', 'stand', 'double', 'split'];

/**
 * Панель хода: «Ещё», «Хватит» и «Дабл» стоят всегда — недоступное неактивно,
 * а не пропадает. «Сплит» показывается, только когда руку можно разделить:
 * пара выпадает редко, и неактивная кнопка почти всю игру была бы лишней
 * (решение владельца). Оставшиеся кнопки делят ширину поровну.
 */
export function ActionBar({
  legal,
  pending,
  onAct,
}: {
  legal: BjLegal;
  pending: boolean;
  onAct: (type: BjActionType) => void;
}) {
  const t = useTranslations('blackjack');
  return (
    <div className="bj-buttons">
      {ACTIONS.filter((a) => a !== 'split' || legal.split).map((a) => (
        <Button key={a} variant="none" className="ct-act" disabled={!legal[a] || pending} onClick={() => onAct(a)}>
          {t(a)}
        </Button>
      ))}
    </div>
  );
}
