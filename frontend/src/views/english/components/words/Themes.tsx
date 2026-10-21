'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Input } from '@/shared/ui/Field';
import { useAddTheme, useDeleteTheme } from '../../api/hooks';
import type { UserTheme } from '../../model/deck';

/**
 * Свои темы — подборки слов под разговор. Клик по теме выбирает её в фильтре
 * словаря; удаление темы слов не удаляет, и спрашивает об этом отдельно.
 */
export function Themes({
  themes,
  selectedId,
  onSelect,
  onDeleted,
}: {
  themes: readonly UserTheme[];
  /** Выбранная в фильтре своя тема. */
  selectedId: string | null;
  onSelect: (themeId: string) => void;
  onDeleted: (themeId: string) => void;
}) {
  const add = useAddTheme();
  const remove = useDeleteTheme();
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<UserTheme | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    add.mutate(t, {
      onSuccess: (theme) => {
        setTitle('');
        onSelect(theme.id);
      },
    });
  };

  return (
    <details className="en-themes">
      <summary>Мои темы · {themes.length}</summary>
      <p className="muted en-themes-hint">
        Тема — слова под разговор: «Собеседование», «В кафе». Добавляй слова кнопкой «В тему».
      </p>
      <form className="en-themes-add" onSubmit={submit}>
        <Input
          placeholder="Название темы"
          aria-label="Название новой темы"
          maxLength={60}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button type="submit" disabled={add.isPending || !title.trim()}>
          Создать
        </Button>
      </form>
      <ErrorNote error={add.error ?? remove.error} fallback="Не удалось сохранить тему" />
      {themes.length > 0 ? (
        <ul className="en-themes-list">
          {themes.map((t) => (
            <li key={t.id}>
              <Button
                variant="none"
                className="en-theme-pick"
                aria-pressed={t.id === selectedId}
                onClick={() => onSelect(t.id)}
              >
                <span>{t.title}</span>
                <span className="muted">{t.cards.length}</span>
              </Button>
              <Button variant="bare" tight className="en-theme-del" onClick={() => setDeleting(t)}>
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          request={{
            title: `Удалить тему «${deleting.title}»?`,
            subtitle: 'Тема — только подборка',
            consequences: [
              'Сама тема исчезнет из фильтров и из выбора колоды в карточках.',
              'Слова останутся в словаре и в карточках, с прежним прогрессом.',
            ],
            onConfirm: () => {
              remove.mutate(deleting.id);
              onDeleted(deleting.id);
            },
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </details>
  );
}
