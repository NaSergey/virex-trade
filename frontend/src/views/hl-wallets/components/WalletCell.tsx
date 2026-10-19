'use client';

import { useTranslations } from 'next-intl';
import { useViewWallet } from '../api/hooks';
import { profileUrl, shortAddress } from '../model/format';

/**
 * Адрес коротко (полный — в подсказке) и ссылка на профиль трейдера. Открытие
 * профиля — и клик, и средняя кнопка (новая вкладка) — помечает кошелёк
 * просмотренным.
 */
export function WalletCell({ address }: { address: string }) {
  const t = useTranslations('hlWallets');
  const view = useViewWallet();
  // stopPropagation: в раскрывающейся таблице клик по ссылке не должен ещё и раскрыть строку.
  const mark = (e: React.MouseEvent) => {
    e.stopPropagation();
    view.mutate(address);
  };
  return (
    <>
      <span className="n" title={address}>
        {shortAddress(address)}
      </span>{' '}
      <a
        className="muted"
        href={profileUrl(address)}
        target="_blank"
        rel="noreferrer noopener"
        onClick={mark}
        onAuxClick={mark}
      >
        {t('profile')} ↗
      </a>
    </>
  );
}
