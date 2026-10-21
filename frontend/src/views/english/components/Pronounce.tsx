'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { alignWords } from '../model/align';
import type { Phrase } from '../model/phrases';
import { listen } from '../model/speech';
import { Marks } from './Marks';
import { Say } from './Say';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону — разреши его браузеру для этого сайта.',
  'service-not-allowed': 'Нет доступа к микрофону — разреши его браузеру для этого сайта.',
  'no-speech': 'Ничего не услышано — скажи ещё раз чуть громче.',
  'audio-capture': 'Микрофон не найден.',
  network: 'Распознавание не ответило — проверь интернет.',
};

/** Произношение: фразу говорят в микрофон, распознанное сверяется по словам. */
export function Pronounce({ phrase, onNext }: { phrase: Phrase; onNext: () => void }) {
  const [heard, setHeard] = useState('');
  const [final, setFinal] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);

  // Ушли со страницы или к другой фразе посреди записи — микрофон выключается.
  useEffect(() => () => stop.current?.(), []);

  const start = () => {
    setHeard('');
    setFinal(false);
    setError(null);
    setActive(true);
    // Запись, оборванная кнопкой или тишиной, финала не присылает — тогда
    // итог по тому, что успели услышать.
    let got = '';
    stop.current = listen({
      onText: (text, isFinal) => {
        got = text;
        setHeard(text);
        if (isFinal) setFinal(true);
      },
      onEnd: () => {
        setActive(false);
        if (got) setFinal(true);
      },
      onError: (code) => setError(ERRORS[code] ?? `Распознавание не сработало (${code}).`),
    });
  };

  return (
    <div className="en-ex">
      <p className="en-ex-task muted">Послушай и скажи вслух</p>
      <p className="en-ex-q">
        <span lang="en" className="en-phrase">
          {phrase.en}
          <Say text={phrase.en} />
          <Say text={phrase.en} slow />
        </span>
      </p>
      {phrase.ru ? <p className="en-ex-hint muted">{phrase.ru}</p> : null}
      <div className="en-ex-actions">
        <Button variant="solid" onClick={active ? () => stop.current?.() : start}>
          <Mic size={14} aria-hidden /> {active ? 'Слушаю… остановить' : heard ? 'Сказать ещё раз' : 'Сказать'}
        </Button>
        <Button variant="bare" onClick={onNext}>
          {final ? 'Дальше' : 'Другая фраза'}
        </Button>
      </div>
      {error ? <p className="neg">{error}</p> : null}
      {heard ? (
        <div className="en-ex-result">
          <p className="muted">
            Услышано: <span lang="en">{heard}</span>
          </p>
          {final ? <Marks marks={alignWords(phrase.en, heard)} /> : null}
        </div>
      ) : null}
    </div>
  );
}
