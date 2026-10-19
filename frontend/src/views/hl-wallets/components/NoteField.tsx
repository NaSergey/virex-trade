'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/shared/ui/Field';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useSaveWallet } from '../api/hooks';

/**
 * Заметка к сохранённому кошельку: пишется по Enter и при уходе из поля, если
 * изменилась. Последняя отправленная — в рефе: Enter и следующий за ним уход
 * из поля иначе слали бы её дважды (проп `note` обновится только после
 * перечитки списка).
 */
export function NoteField({ address, note }: { address: string; note: string | null }) {
  const t = useTranslations('hlWallets');
  const { save } = useSaveWallet();
  const [value, setValue] = useState(note ?? '');
  const sent = useRef((note ?? '').trim());
  const commit = () => {
    const next = value.trim();
    if (next === sent.current) return;
    const prev = sent.current;
    sent.current = next;
    // Не записалась — повтор того же текста должен уйти снова.
    save.mutate({ address, note: next }, { onError: () => (sent.current = prev) });
  };
  return (
    <>
      <Input
        full
        maxLength={500}
        placeholder={t('notePlaceholder')}
        aria-label={t('noteAria')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      <ErrorNote error={save.error} fallback={t('noteFailed')} />
    </>
  );
}
