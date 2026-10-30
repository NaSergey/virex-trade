'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import type { LedgerColumn } from '@/shared/ui/LedgerTable';
import type { HlWalletRow } from '../api/hooks';

/**
 * «Подробнее» в карточке кошелька на телефоне. Карточка показывает главное —
 * баланс, ROI и PnL за 7 и 30 дней, — остальные числа раскрываются этой
 * кнопкой у каждой карточки отдельно. На широком экране колонки нет
 * (`.narrow-only`): там в строке видно всё.
 *
 * Отдельно от раскрытия строки: у «Сохранённых» строка раскрывается
 * заметкой и позициями, а здесь — только числа самой строки.
 */
export function useDetailsColumn() {
  const t = useTranslations('hlWallets');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggle = (address: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(address)) next.add(address);
      return next;
    });

  const column: LedgerColumn<HlWalletRow> = {
    key: 'details',
    colClassName: 'narrow-only',
    noSkeleton: true,
    render: (r) => {
      const shown = open.has(r.address);
      return (
        <Button
          variant="bare"
          tight
          aria-expanded={shown}
          // Строка раскрывается по клику, и кнопка не должна её раскрывать.
          onClick={(e) => {
            e.stopPropagation();
            toggle(r.address);
          }}
        >
          {shown ? `${t('detailsHide')} ▴` : `${t('details')} ▾`}
        </Button>
      );
    },
  };

  return { column, rowClass: (r: HlWalletRow) => (open.has(r.address) ? 'hlw-open' : undefined) };
}
