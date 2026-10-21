'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Input } from '@/shared/ui/Field';
import { useAddWord, useDeleteWord } from '../api/hooks';
import type { CustomWord } from '../model/deck';
import { Say } from './Say';

/**
 * Свои слова — наверху карточек: форма и список под раскрытием. Своё слово
 * встаёт в колоду первым.
 */
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

  return (
    <section className="en-mywords">
      <form className="en-add" onSubmit={submit}>
        <Input
          lang="en"
          placeholder="Новое слово"
          aria-label="Слово по-английски"
          autoCapitalize="none"
          autoCorrect="off"
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
      {words.length > 0 ? (
        <details className="en-mylist">
          <summary>Мои слова · {words.length}</summary>
          <ul>
            {words.map((w) => (
              <li key={w.id}>
                <span className="en-phrase">
                  <span lang="en">{w.en}</span>
                  <Say text={w.en} />
                </span>
                <span className="muted">{w.ru}</span>
                <Button variant="bare" tight onClick={() => remove.mutate(w.id)}>
                  Удалить
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
