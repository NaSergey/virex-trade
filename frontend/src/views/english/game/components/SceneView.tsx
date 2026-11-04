'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { cn } from '@/shared/lib/utils/css';
import { useAddWord } from '../../api/hooks';
import { Say } from '../../components/Say';
import { canListen, listen, speak } from '../../model/speech';
import { shillings } from '../labels';
import { currentScene, type Action, type RunState, type Screen } from '../model/engine';
import type { SceneRun } from '../model/scene';

type Dispatch = (a: Action) => void;

const LEVEL = ['', 'Турист', 'Местный', 'Лондонец'] as const;

function Bank({ run, dispatch }: { run: SceneRun; dispatch: Dispatch }) {
  const [built, setBuilt] = useState<number[]>([]);
  const bank = run.bank ?? [];
  return (
    <div className="eg-order">
      <p className="eg-built" lang="en">
        {built.length ? built.map((i) => bank[i]).join(' ') : <span className="muted">собери ответ из слов</span>}
      </p>
      <div className="eg-bank">
        {bank.map((w, i) => (
          <Button key={i} variant="default" tight disabled={built.includes(i)} onClick={() => setBuilt([...built, i])}>
            {w}
          </Button>
        ))}
      </div>
      <div className="eg-row">
        <Button
          variant="solid"
          disabled={built.length !== bank.length}
          onClick={() => {
            dispatch({ type: 'reply', value: built, voice: false, now: Date.now() });
            setBuilt([]);
          }}
        >
          Ответить
        </Button>
        <Button variant="bare" disabled={built.length === 0} onClick={() => setBuilt([])}>
          Сбросить
        </Button>
      </div>
    </div>
  );
}

function SayReply({ dispatch, speech }: { dispatch: Dispatch; speech: boolean }) {
  const voice = speech && canListen();
  const [value, setValue] = useState('');
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  if (!voice) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (!value.trim()) return;
      dispatch({ type: 'reply', value, voice: false, now: Date.now() });
      setValue('');
    };
    return (
      <form className="eg-type" onSubmit={submit}>
        <p className="muted">Напиши ответ по-английски.</p>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          lang="en"
          aria-label="Ответ по-английски"
        />
        <Button type="submit" variant="solid" disabled={!value.trim()}>
          Ответить
        </Button>
      </form>
    );
  }

  const start = () => {
    setError(null);
    setActive(true);
    let got = '';
    stop.current = listen({
      onText: (text) => {
        got = text;
      },
      onEnd: () => {
        setActive(false);
        if (got) dispatch({ type: 'reply', value: got, voice: true, now: Date.now() });
      },
      onError: (code) =>
        setError(code === 'not-allowed' ? 'Нет доступа к микрофону — разреши его браузеру.' : 'Не расслышал — скажи ещё раз.'),
    });
  };
  return (
    <div className="eg-speak">
      <Button variant="solid" onClick={active ? () => stop.current?.() : start}>
        <Mic size={16} aria-hidden /> {active ? 'Слушаю… остановить' : 'Ответить вслух'}
      </Button>
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}

/** Реплика собеседника: на втором и третьем уровне текст — по нажатию. */
function NpcLine({ en, ru, why, hidden, onReveal }: { en: string; ru?: string; why?: string; hidden: boolean; onReveal: () => void }) {
  const [showRu, setShowRu] = useState(false);
  return (
    <li className="eg-line eg-line-npc">
      {hidden ? (
        <Button variant="bare" tight onClick={onReveal}>
          показать текст
        </Button>
      ) : (
        <span lang="en">{en}</span>
      )}
      <Say text={en} />
      {ru && !hidden ? (
        <Button variant="bare" tight onClick={() => setShowRu(!showRu)}>
          {showRu ? ru : 'перевод'}
        </Button>
      ) : null}
      {why ? <span className="eg-why">{why}</span> : null}
    </li>
  );
}

export function SceneView({ run, sc, dispatch }: { run: RunState; sc: Extract<Screen, { kind: 'scene' }>; dispatch: Dispatch }) {
  const scene = currentScene(run);
  const r = sc.run;
  const addWord = useAddWord();
  const [added, setAdded] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const end = useRef<HTMLLIElement>(null);

  // Новая реплика собеседника звучит сама; лента едет к ней.
  const lastNpc = [...r.log].reverse().find((l) => l.who === 'npc');
  useEffect(() => {
    if (lastNpc) speak(lastNpc.en);
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [r.log.length, lastNpc]);

  if (!scene) return null;
  const hiddenAt = (i: number) => r.level >= 2 && !revealed.includes(i) && !(r.level === 3 && r.peeked);
  const reveal = (i: number) => {
    if (r.level === 3 && !r.peeked) dispatch({ type: 'peek' });
    setRevealed([...revealed, i]);
  };

  return (
    <section className="eg-scene">
      <header className="eg-plate">
        <b>{scene.place.en}</b>
        <span>{scene.place.ru}</span>
      </header>
      <p className="eg-scene-who">
        {scene.npc.name}, {scene.npc.role} · уровень {r.level} «{LEVEL[r.level]}»
        <span className="eg-patience" aria-label={`Терпение ${r.patience}`}>
          {'●'.repeat(Math.max(0, r.patience))}
          {'○'.repeat(Math.max(0, 3 - r.patience))}
        </span>
      </p>
      <p className="eg-goal muted">{scene.goal}</p>
      {r.level === 3 && !r.peeked ? <p className="eg-note">Текст реплик — по нажатию, но это стоит звезды.</p> : null}
      <ul className="eg-log">
        {r.log.map((l, i) =>
          l.who === 'npc' ? (
            <NpcLine key={i} en={l.en} ru={l.ru} why={l.why} hidden={hiddenAt(i)} onReveal={() => reveal(i)} />
          ) : (
            <li key={i} className={cn('eg-line eg-line-me', l.ok === false && 'eg-line-shown')} lang="en">
              {l.en}
              {l.ok === false ? <span className="eg-why">так было бы верно</span> : null}
            </li>
          ),
        )}
        <li ref={end} aria-hidden />
      </ul>
      {!r.done && r.options ? (
        r.level === 1 ? (
          <div className="eg-options eg-options-wide">
            {r.options.map((o, i) => (
              <Button
                key={i}
                variant="default"
                disabled={r.struck.includes(i)}
                className={cn(r.struck.includes(i) && 'eg-struck')}
                onClick={() => dispatch({ type: 'reply', value: i, voice: false, now: Date.now() })}
              >
                <span lang="en">{o.en}</span>
              </Button>
            ))}
          </div>
        ) : r.level === 2 ? (
          <Bank key={r.step} run={r} dispatch={dispatch} />
        ) : (
          <SayReply key={r.step} dispatch={dispatch} speech={run.speech} />
        )
      ) : null}
      {r.done ? (
        <div className="eg-scene-end">
          <p className="eg-stars" aria-label={`Звёзд: ${sc.stars ?? 0}`}>
            {'★'.repeat(sc.stars ?? 0)}
            {'☆'.repeat(3 - (sc.stars ?? 0))}
          </p>
          <p className="muted">
            {r.done === 'fail'
              ? 'Собеседник потерял терпение: −4 здоровья.'
              : `+${shillings(sc.coins ?? 0)}${(sc.stars ?? 0) >= 2 && r.level < 3 ? ' · уровень сцены вырос' : ''}`}
          </p>
          <ul className="eg-phrases">
            {scene.phrases.map(([en, ru]) => (
              <li key={en}>
                <span lang="en">{en}</span> <Say text={en} />
                <span className="muted">{ru}</span>
                <Button
                  variant="bare"
                  tight
                  disabled={added.includes(en)}
                  onClick={() => {
                    addWord.mutate({ en, ru });
                    setAdded([...added, en]);
                  }}
                >
                  {added.includes(en) ? 'в моих словах' : '+ в мои слова'}
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="solid" onClick={() => dispatch({ type: 'next', now: Date.now() })}>
            Дальше
          </Button>
        </div>
      ) : null}
    </section>
  );
}
