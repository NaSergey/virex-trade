'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Input } from '@/shared/ui/Field';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { useAddWord, useDeleteWord } from '../api/hooks';
import type { CustomWord } from '../model/deck';
import { Say } from './Say';

/** Свои слова: форма и список. Карточка своего слова встаёт в колоду первой. */
export function MyWords({ words }: { words: readonly CustomWord[] }) {
  const add = useAddWord();
  const remove = useDeleteWord();
  const [en, setEn] = useState('');
  const [ru, setRu] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!en.trim() || !ru.trim()) return;
    add.mutate(
      { en: en.trim(), ru: ru.trim() },
      {
        onSuccess: () => {
          setEn('');
          setRu('');
        },
      },
    );
  };

  const columns: LedgerColumn<CustomWord>[] = [
    {
      key: 'en',
      header: 'Слово',
      render: (w) => (
        <span className="en-phrase">
          <span lang="en">{w.en}</span>
          <Say text={w.en} />
        </span>
      ),
    },
    { key: 'ru', header: 'Перевод', render: (w) => w.ru },
    {
      key: 'del',
      align: 'right',
      noSkeleton: true,
      render: (w) => (
        <Button variant="bare" tight onClick={() => remove.mutate(w.id)}>
          Удалить
        </Button>
      ),
    },
  ];

  return (
    <section className="en-section">
      <h3>Мои слова</h3>
      <form className="en-add" onSubmit={submit}>
        <Input
          lang="en"
          placeholder="Слово по-английски"
          aria-label="Слово по-английски"
          maxLength={100}
          value={en}
          onChange={(e) => setEn(e.target.value)}
        />
        <Input
          placeholder="Перевод"
          aria-label="Перевод"
          maxLength={200}
          value={ru}
          onChange={(e) => setRu(e.target.value)}
        />
        <Button type="submit" disabled={add.isPending || !en.trim() || !ru.trim()}>
          Добавить
        </Button>
      </form>
      <ErrorNote error={add.error ?? remove.error} fallback="Не удалось сохранить слово" />
      {words.length > 0 ? <LedgerTable columns={columns} rows={[...words]} rowKey={(w) => w.id} /> : null}
    </section>
  );
}
