'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { cn } from '@/shared/lib/utils/css';
import { useQuizDone } from '../api/hooks';
import type { DeckCard } from '../model/deck';
import { buildQuiz, type QuizDir } from '../model/quiz';
import { speak } from '../model/speech';
import { Say } from './Say';

/** Верный ответ сам листает дальше через эту паузу — на телефоне одно касание на вопрос. */
const AUTO_NEXT_MS = 700;
const decodeDeck = (raw: string | null) => raw || 'all';
const encodeDeck = (v: string) => v;

/** Один прогон теста: вопросы фиксируются на старте, новый прогон — смена ключа у родителя. */
export function QuizRun({
  deck,
  pool,
  size,
  dir,
  spec,
  onAgain,
  onMistakes,
}: {
  deck: readonly DeckCard[];
  pool: readonly DeckCard[];
  size: number;
  dir: QuizDir;
  /** Подборка теста — «Учить эту тему» ставит её колодой карточек. */
  spec: string;
  onAgain: () => void;
  onMistakes: (cardIds: string[]) => void;
}) {
  const router = useRouter();
  const done = useQuizDone();
  const [, setDeck] = usePersistentValue<string>('virex.english.deck', decodeDeck, 'all', encodeDeck);
  const [quiz] = useState(() => buildQuiz(deck, pool, size, dir));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [results, setResults] = useState<boolean[]>([]);

  const q = quiz[index];
  const next = () => {
    setPicked(null);
    setIndex((i) => i + 1);
  };

  const pick = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    setResults((r) => [...r, i === q.answer]);
    done.mutate();
    speak(q.card.en);
  };

  // Верно — дальше само; ошибся — ждём «Дальше»: правильный ответ надо успеть прочесть.
  const right = q && picked === q.answer;
  useEffect(() => {
    if (!right) return;
    const t = window.setTimeout(next, AUTO_NEXT_MS);
    return () => window.clearTimeout(t);
  }, [right]);

  // Клавиатура: 1–4 — вариант, Enter — дальше.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const n = Number(e.key);
      if (picked === null && n >= 1 && n <= q.options.length) pick(n - 1);
      else if (picked !== null && e.key === 'Enter') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (quiz.length === 0) {
    return <EmptyState title="В этой теме нет слов">Выбери другую тему или добавь в эту слова в «Темах».</EmptyState>;
  }

  if (!q) {
    const rightCount = results.filter(Boolean).length;
    const wrong = quiz.filter((_, i) => !results[i]).map((x) => x.card);
    return (
      <section className="en-quiz">
        <p className="en-total">
          Верно <b className={rightCount === quiz.length ? 'pos' : undefined}>{rightCount}</b> из {quiz.length} ·{' '}
          {Math.round((rightCount / quiz.length) * 100)} %
        </p>
        <div className="en-ex-actions">
          <Button variant="solid" onClick={onAgain}>
            Новый тест
          </Button>
          {wrong.length > 0 ? <Button onClick={() => onMistakes(wrong.map((c) => c.id))}>Повторить ошибки</Button> : null}
          <Button
            onClick={() => {
              setDeck(spec);
              router.push('/english/cards');
            }}
          >
            Учить тему карточками
          </Button>
        </div>
        {wrong.length > 0 ? (
          <section className="en-section">
            <h3>Ошибки · {wrong.length}</h3>
            <ul className="en-qmiss">
              {wrong.map((c) => (
                <li key={c.id}>
                  <span className="en-phrase">
                    <span lang="en">{c.en}</span>
                    <Say text={c.en} />
                  </span>
                  <span className="muted">{c.ru}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    );
  }

  return (
    <section className="en-quiz">
      <div className="en-progress" aria-hidden>
        {quiz.map((x, i) => (
          <span key={x.card.id} className={i < results.length ? (results[i] ? 'is-right' : 'is-wrong') : undefined} />
        ))}
      </div>
      <p className="en-qcount muted">
        {index + 1} / {quiz.length}
      </p>
      <p className="en-qprompt" lang={dir === 'en' ? 'en' : 'ru'}>
        {q.prompt}
        {dir === 'en' ? <Say text={q.card.en} /> : null}
      </p>
      <div className="en-qoptions">
        {q.options.map((opt, i) => (
          <Button
            key={opt}
            variant="none"
            lang={dir === 'en' ? 'ru' : 'en'}
            className={cn(
              'en-qopt',
              picked !== null && i === q.answer && 'is-right',
              picked === i && i !== q.answer && 'is-wrong',
            )}
            disabled={picked !== null}
            onClick={() => pick(i)}
          >
            <span className="en-qkey muted">{i + 1}</span>
            {opt}
          </Button>
        ))}
      </div>
      {picked !== null && picked !== q.answer ? (
        <div className="en-ex-result">
          <p className="neg">
            Правильно: <b>{q.options[q.answer]}</b>
            {dir === 'ru' ? <Say text={q.card.en} /> : null}
          </p>
          <Button variant="solid" autoFocus onClick={next}>
            Дальше
          </Button>
        </div>
      ) : null}
    </section>
  );
}
