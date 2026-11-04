'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Volume2, X } from 'lucide-react';
import { useAddWord, useEnglishState } from '../../api/hooks';
import { speak } from '../../model/speech';
import { glossOf, tokens, type Gloss } from '../model/gloss';

/**
 * Перевод по нажатию. `Tap` режет английский текст на слова — каждое нажимается; нажатое
 * открывает одну плашку внизу экрана (`WordCard`, стоит на странице один раз): словарная форма,
 * перевод, голос и «+ в мои слова». Добавленное слово уходит в «Карточки» своим словом — его
 * приносят на повторение, как и любое другое.
 */

let open: Gloss | null = null;
const listeners = new Set<() => void>();
const show = (g: Gloss | null) => {
  open = g;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useOpen = () =>
  useSyncExternalStore(
    subscribe,
    () => open,
    () => null,
  );

/** Английский текст, каждое слово которого можно нажать. */
export function Tap({ text, className }: { text: string; className?: string }): ReactNode {
  return (
    <span className={className} lang="en">
      {tokens(text).map((t, i) => {
        const g = t.word ? glossOf(t.text) : null;
        if (!g) return t.text;
        return (
          <span
            key={i}
            className="ah-tap"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              show(g);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                show(g);
              }
            }}
          >
            {t.text}
          </span>
        );
      })}
    </span>
  );
}

/** Перевод слова прямо под плиткой приказа: «chop — рубить». */
export function TileHint({ word }: { word: string | null }) {
  const g = word ? glossOf(word.split(' ').at(-1)!) : null;
  if (!word || !g) return <p className="ah-tilehint">&nbsp;</p>;
  return (
    <p className="ah-tilehint">
      <b lang="en">{word}</b> — {g.ru}
    </p>
  );
}

export function WordCard() {
  const g = useOpen();
  const state = useEnglishState();
  const add = useAddWord();
  const [added, setAdded] = useState<string[]>([]);
  if (!g) return null;
  const mine =
    added.includes(g.en.toLowerCase()) || !!state.data?.words.some((w) => w.en.trim().toLowerCase() === g.en.toLowerCase());
  return (
    <div className="ah-wordcard" role="dialog" aria-label={`Translation of ${g.en}`}>
      <div className="ah-wordcard-row">
        <b lang="en">{g.en}</b>
        <button type="button" className="ah-wordcard-ic" onClick={() => speak(g.en)} aria-label="Say it">
          <Volume2 size={18} aria-hidden />
        </button>
        <button type="button" className="ah-wordcard-ic" onClick={() => show(null)} aria-label="Close">
          <X size={18} aria-hidden />
        </button>
      </div>
      <p>{g.ru}</p>
      <button
        type="button"
        className="ah-wordcard-add"
        disabled={mine || add.isPending}
        onClick={() => add.mutate({ en: g.en, ru: g.ru }, { onSuccess: () => setAdded((a) => [...a, g.en.toLowerCase()]) })}
      >
        {mine ? '✓ в моих словах — придёт в карточках' : add.isError ? 'Не сохранилось — ещё раз' : '+ в мои слова'}
      </button>
    </div>
  );
}

export const closeWord = () => show(null);
