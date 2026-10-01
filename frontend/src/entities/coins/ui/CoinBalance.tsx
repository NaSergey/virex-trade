'use client';

import { useTranslations } from 'next-intl';
import { useCoinBalance } from '../api/hooks';
import { CoinIcon } from '@/shared/ui/CoinIcon';

/**
 * Монеты в шапке. Кнопка, а не подпись: клик открывает ту же модалку доната —
 * единственное место, где монеты берутся. Пока баланс не пришёл, показываем
 * прочерк, а не ноль: ноль — это утверждение, и неверное.
 */
export function CoinBalance({ onBuy }: { onBuy: () => void }) {
  const t = useTranslations('coins');
  const { data } = useCoinBalance();
  return (
    <button type="button" className="coins" onClick={onBuy} title={t('buyHint')}>
      <span className="coins-n">{data ? data.balance.toLocaleString('ru-RU') : '—'}</span>
      <CoinIcon />
    </button>
  );
}
