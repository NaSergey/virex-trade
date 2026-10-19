'use client';

import { useTranslations } from 'next-intl';
import { profileUrl, shortAddress } from '../model/format';

/** Адрес коротко (полный — в подсказке) и ссылка на профиль трейдера. */
export function WalletCell({ address }: { address: string }) {
  const t = useTranslations('hlWallets');
  return (
    <>
      <span className="n" title={address}>
        {shortAddress(address)}
      </span>{' '}
      <a className="muted" href={profileUrl(address)} target="_blank" rel="noreferrer noopener">
        {t('profile')} ↗
      </a>
    </>
  );
}
