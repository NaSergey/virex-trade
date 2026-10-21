'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import type { Exercise } from '../content/types';
import { fillGap, isCorrect, isGapCorrect } from '../model/check';
import { scramble } from '../model/random';
import { Say } from './Say';

/** Полная фраза с ответом — для показа и озвучки. Подсказки в скобках из неё уходят. */
export function fullSentence(e: Exercise): string {
  switch (e.type) {
    case 'choice':
      return fillGap(e.q, e.options[e.answer]).replace(/\s*\([^)]*\)/g, '');
    case 'gap':
      return fillGap(e.q, e.answers[0]).replace(/\s*\([^)]*\)/g, '');
    default:
      return e.answers[0];
  }
}

/** Сколько после проверки Enter не листает дальше — защита от автоповтора клавиши. */
export const ENTER_GUARD_MS = 400;

const TASK: Record<Exercise['type'], string> = {
  choice: 'Выбери вариант',
  gap: 'Впиши пропущенное',
  order: 'Собери предложение',
  translate: 'Переведи на английский',
};

/**
 * Одно задание: ответ → проверка → «Дальше». Состояние живёт внутри и
 * сбрасывается сменой ключа у родителя.
 */
export function ExerciseView({
  exercise: e,
  onAnswer,
  onNext,
}: {
  exercise: Exercise;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}) {
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [bank] = useState(() => (e.type === 'order' ? scramble(e.words) : []));
  const [built, setBuilt] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const settledAt = useRef(0);

  const settle = (correct: boolean) => {
    settledAt.current = Date.now();
    setResult(correct);
    onAnswer(correct);
  };

  const check = () => {
    if (result !== null) return;
    if (e.type === 'gap') {
      if (!value.trim()) return;
      settle(isGapCorrect(e.q, value, e.answers));
    } else if (e.type === 'translate') {
      if (!value.trim()) return;
      settle(isCorrect(value, e.answers));
    } else if (e.type === 'order') {
      if (built.length === 0) return;
      settle(isCorrect(built.map((i) => bank[i]).join(' '), e.answers));
    }
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (result === null) check();
    // Зажатый Enter автоповтором нажал бы «Дальше» сразу за проверкой — и итог
    // задания пролетел бы мимо глаз.
    else if (Date.now() - settledAt.current > ENTER_GUARD_MS) onNext();
  };

  const [before, after] = e.type === 'choice' || e.type === 'gap' ? e.q.split('___') : ['', ''];
  const hint = 'ru' in e && e.type !== 'translate' ? e.ru : undefined;

  return (
    <form className="en-ex" onSubmit={submit}>
      <p className="en-ex-task muted">{TASK[e.type]}</p>

      {e.type === 'translate' ? <p className="en-ex-q">{e.ru}</p> : null}

      {e.type === 'choice' ? (
        <>
          <p className="en-ex-q" lang="en">
            {before}
            <span className="en-gap">{picked === null ? '___' : e.options[picked]}</span>
            {after}
          </p>
          <div className="en-options">
            {e.options.map((opt, i) => (
              <Button
                key={opt}
                lang="en"
                variant={result !== null && i === e.answer ? 'solid' : 'default'}
                aria-pressed={picked === i}
                disabled={result !== null}
                onClick={() => {
                  setPicked(i);
                  settle(i === e.answer);
                }}
              >
                {opt}
              </Button>
            ))}
          </div>
        </>
      ) : null}

      {e.type === 'gap' ? (
        <p className="en-ex-q" lang="en">
          {before}
          <Input
            className="en-gap-in"
            lang="en"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label="Пропущенное слово"
            value={value}
            disabled={result !== null}
            onChange={(ev) => setValue(ev.target.value)}
          />
          {after}
        </p>
      ) : null}

      {e.type === 'translate' ? (
        <Input
          full
          lang="en"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="Перевод"
          placeholder="По-английски"
          value={value}
          disabled={result !== null}
          onChange={(ev) => setValue(ev.target.value)}
        />
      ) : null}

      {e.type === 'order' ? (
        <>
          <p className="en-built" lang="en" aria-label="Собранное предложение">
            {built.length === 0 ? <span className="muted">Нажимай на слова по порядку</span> : null}
            {built.map((i, k) => (
              <Button
                key={i}
                variant="none"
                className="en-chip"
                disabled={result !== null}
                onClick={() => setBuilt(built.filter((_, j) => j !== k))}
              >
                {bank[i]}
              </Button>
            ))}
          </p>
          <div className="en-bank" lang="en">
            {bank.map((w, i) =>
              built.includes(i) ? null : (
                <Button
                  key={i}
                  variant="none"
                  className="en-chip"
                  disabled={result !== null}
                  onClick={() => setBuilt([...built, i])}
                >
                  {w}
                </Button>
              ),
            )}
          </div>
        </>
      ) : null}

      {hint ? <p className="en-ex-hint muted">{hint}</p> : null}

      {result === null ? (
        e.type === 'choice' ? null : (
          <div className="en-ex-actions">
            <Button type="submit" variant="solid">
              Проверить
            </Button>
          </div>
        )
      ) : (
        <div className="en-ex-result">
          <p className={result ? 'pos' : 'neg'}>
            {result ? 'Верно' : 'Неверно. Правильно:'}{' '}
            <span lang="en" className="en-phrase">
              <b>{fullSentence(e)}</b>
              <Say text={fullSentence(e)} />
            </span>
          </p>
          <Button type="submit" variant="solid" autoFocus>
            Дальше
          </Button>
        </div>
      )}
    </form>
  );
}
