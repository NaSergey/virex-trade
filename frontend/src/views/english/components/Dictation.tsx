'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { usePhraseDone } from '../api/hooks';
import { alignWords } from '../model/align';
import type { Phrase } from '../model/phrases';
import { speak } from '../model/speech';
import { ENTER_GUARD_MS } from './ExerciseView';
import { Marks } from './Marks';
import { Say } from './Say';

/** Диктант: фраза звучит, её пишут на слух, проверка размечает слова. */
export function Dictation({ phrase, onNext }: { phrase: Phrase; onNext: () => void }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const checkedAt = useRef(0);
  const done = usePhraseDone();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (checked) {
      if (Date.now() - checkedAt.current > ENTER_GUARD_MS) onNext();
    } else if (value.trim()) {
      checkedAt.current = Date.now();
      setChecked(true);
      done.mutate();
    }
  };

  return (
    <form className="en-ex" onSubmit={submit}>
      <p className="en-ex-task muted">Послушай и напиши, что услышал</p>
      <div className="en-ex-actions">
        <Button onClick={() => speak(phrase.en)}>Послушать</Button>
        <Button onClick={() => speak(phrase.en, true)}>Медленно</Button>
      </div>
      <Input
        full
        lang="en"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        aria-label="Что услышал"
        placeholder="По-английски"
        value={value}
        disabled={checked}
        onChange={(e) => setValue(e.target.value)}
      />
      {checked ? (
        <div className="en-ex-result">
          <Marks marks={alignWords(phrase.en, value)} />
          <p>
            <span lang="en" className="en-phrase">
              <b>{phrase.en}</b>
              <Say text={phrase.en} />
            </span>{' '}
            <span className="muted">{phrase.ru}</span>
          </p>
          <Button type="submit" variant="solid" autoFocus>
            Дальше
          </Button>
        </div>
      ) : (
        <div className="en-ex-actions">
          <Button type="submit" variant="solid">
            Проверить
          </Button>
          <Button variant="bare" onClick={onNext}>
            Другая фраза
          </Button>
        </div>
      )}
    </form>
  );
}
