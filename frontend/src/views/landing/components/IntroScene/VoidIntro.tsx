'use client';

import { type RefObject } from 'react';

/** Сцена 00: состояние покоя до первого скролла — слово и тихая подсказка. */
export function VoidIntro({
  wordRef,
  hintRef,
}: {
  wordRef: RefObject<HTMLSpanElement | null>;
  hintRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className="ls-void">
      <span className="ls-void-word" ref={wordRef}>
        Virex
      </span>
      <span className="ls-void-hint" ref={hintRef} aria-hidden>
        ↓
      </span>
    </div>
  );
}
