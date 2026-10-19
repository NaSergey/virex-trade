'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useAddWallet } from '../api/hooks';

/** Адрес кошелька Hyperliquid: `0x` и 40 шестнадцатеричных знаков. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Добавить свой кошелёк в сохранённые — по адресу, минуя отбор бота. Бот
 * разберёт его в течение минуты, и статистика появится в строке сама.
 */
export function AddWalletForm() {
  const t = useTranslations('hlWallets');
  const add = useAddWallet();
  const [address, setAddress] = useState('');
  const valid = ADDRESS.test(address.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    add.mutate(address, { onSuccess: () => setAddress('') });
  };

  return (
    <form onSubmit={submit} className="newrow" aria-label={t('addAria')}>
      <Input
        placeholder={t('addPlaceholder')}
        aria-label={t('addAria')}
        spellCheck={false}
        autoComplete="off"
        style={{ width: 400, maxWidth: '100%' }}
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          if (add.isError) add.reset();
        }}
      />
      <Button type="submit" variant="solid" disabled={!valid || add.isPending}>
        {t('add')}
      </Button>
      <ErrorNote error={add.error} fallback={t('addFailed')} />
    </form>
  );
}
