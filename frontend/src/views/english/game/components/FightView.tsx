'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { cn } from '@/shared/lib/utils/css';
import { ExerciseView } from '../../components/ExerciseView';
import { Say } from '../../components/Say';
import { listen, speak } from '../../model/speech';
import { MODE_HINT, MODE_LABEL, tagOf } from '../labels';
import { critWindow } from '../model/combat';
import { currentExercise, modesOf, previewDamage, type Action, type Fight, type RunState } from '../model/engine';
import type { Mode } from '../model/types';
import { Fog } from './Fog';

/** Верный ответ сам листает дальше — на телефоне одно касание на ход. */
const AUTO_NEXT_MS = 900;

type Dispatch = (a: Action) => void;

/** Противник: имя, правило, здоровье и намерение. */
function FoeHead({ f }: { f: Fight }) {
  const { foe } = f;
  const tags = [foe.weak ? `слаб к «${MODE_LABEL[foe.weak]}»` : '', foe.resist ? `стоек к «${MODE_LABEL[foe.resist]}»` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <header className="eg-foe">
      <div className="eg-foe-name">
        <span>{foe.kind === 'boss' ? 'Хранитель' : foe.kind === 'elite' ? 'Элита' : 'Туман'}</span>
        <b>{foe.name}</b>
      </div>
      {foe.text || tags ? <p className="eg-foe-rule muted">{[foe.text, tags].filter(Boolean).join(' · ')}</p> : null}
      <div className="eg-bar" aria-label={`Здоровье противника ${foe.hp} из ${foe.maxHp}`}>
        <i style={{ transform: `scaleX(${foe.hp / foe.maxHp})` }} />
      </div>
      <p className="eg-foe-meta">
        <span>
          {foe.hp} / {foe.maxHp}
        </span>
        <span>
          удар {foe.atk} · через {foe.timer} {foe.timer === 1 ? 'ход' : foe.timer < 5 ? 'хода' : 'ходов'}
        </span>
      </p>
    </header>
  );
}

/** Полоса окна крита: тает от полной до нуля, дальше крита нет. */
function CritBar({ ms, at }: { ms: number; at: number }) {
  return (
    <div className="eg-crit" aria-hidden>
      <i key={at} style={{ animationDuration: `${ms}ms` }} />
    </div>
  );
}

/** Клетки длины слова под полем; подсказка открывает половину букв. */
function Cells({ length, first, reveal }: { length: number[]; first?: string; reveal?: string }) {
  let k = 0;
  return (
    <div className="eg-cells" aria-hidden>
      {length.map((n, w) => (
        <span key={w} className="eg-cells-word">
          {Array.from({ length: n }, (_, i) => {
            const at = k++;
            const ch = reveal && at < Math.ceil(reveal.length / 2) ? reveal[at] : at === 0 && first ? first : '';
            return <i key={i}>{ch}</i>;
          })}
        </span>
      ))}
    </div>
  );
}

function TextAnswer({ f, dispatch }: { f: Fight; dispatch: Dispatch }) {
  const ch = f.challenge!;
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) dispatch({ type: 'answer', value, now: Date.now() });
  };
  const letters = String(ch.answer).replace(/[^\p{L}']/gu, '');
  return (
    <form className="eg-type" onSubmit={submit}>
      {ch.length ? <Cells length={ch.length} first={ch.first} reveal={f.hint ? letters : undefined} /> : null}
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        lang="en"
        aria-label="Ответ по-английски"
      />
      <div className="eg-row">
        <Button type="submit" variant="solid" disabled={!value.trim()}>
          Ударить
        </Button>
        <Button type="button" variant="bare" onClick={() => dispatch({ type: 'dontKnow', now: Date.now() })}>
          Не помню
        </Button>
      </div>
    </form>
  );
}

function SpeakAnswer({ f, dispatch }: { f: Fight; dispatch: Dispatch }) {
  const [active, setActive] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = () => {
    setHeard('');
    setError(null);
    setActive(true);
    let got = '';
    stop.current = listen({
      onText: (text) => {
        got = text;
        setHeard(text);
      },
      onEnd: () => {
        setActive(false);
        if (got) dispatch({ type: 'answer', value: got, now: Date.now() });
      },
      onError: (code) =>
        setError(code === 'not-allowed' ? 'Нет доступа к микрофону — разреши его браузеру.' : 'Не расслышал — скажи ещё раз.'),
    });
  };

  return (
    <div className="eg-speak">
      {f.tries > 0 ? <p className="eg-note">Не совпало{heard ? `: «${heard}»` : ''}. Ещё одна попытка.</p> : null}
      <div className="eg-row">
        <Button variant="solid" onClick={active ? () => stop.current?.() : start}>
          <Mic size={16} aria-hidden /> {active ? 'Слушаю… остановить' : 'Сказать'}
        </Button>
        <Button variant="bare" onClick={() => dispatch({ type: 'dontKnow', now: Date.now() })}>
          Не помню
        </Button>
      </div>
      {heard && active ? <p className="muted" lang="en">{heard}</p> : null}
      {error ? <p className="neg">{error}</p> : null}
    </div>
  );
}

function OrderAnswer({ f, dispatch }: { f: Fight; dispatch: Dispatch }) {
  const ch = f.challenge!;
  const [built, setBuilt] = useState<number[]>([]);
  return (
    <div className="eg-order">
      <p className="eg-built" lang="en">
        {built.length ? built.map((i) => ch.bank![i]).join(' ') : <span className="muted">нажимай слова по порядку</span>}
      </p>
      <div className="eg-bank">
        {ch.bank!.map((w, i) => (
          <Button key={i} variant="default" tight disabled={built.includes(i)} onClick={() => setBuilt([...built, i])}>
            {w}
          </Button>
        ))}
      </div>
      <div className="eg-row">
        <Button
          variant="solid"
          disabled={built.length !== ch.bank!.length}
          onClick={() => dispatch({ type: 'answer', value: built, now: Date.now() })}
        >
          Ударить
        </Button>
        <Button variant="bare" onClick={() => setBuilt([])} disabled={built.length === 0}>
          Сбросить
        </Button>
        <Button variant="bare" onClick={() => dispatch({ type: 'dontKnow', now: Date.now() })}>
          Не помню
        </Button>
      </div>
    </div>
  );
}

function Options({ f, dispatch }: { f: Fight; dispatch: Dispatch }) {
  const ch = f.challenge!;
  return (
    <div className="eg-options">
      {ch.options!.map((o, i) => (
        <Button
          key={i}
          variant="default"
          disabled={f.hidden?.includes(i)}
          onClick={() => dispatch({ type: 'answer', value: i, now: Date.now() })}
        >
          <span className="eg-key">{i + 1}</span>
          {o}
        </Button>
      ))}
    </div>
  );
}

/** Задание удара: что видно и чем отвечать. */
function Challenge({ run, f, dispatch }: { run: RunState; f: Fight; dispatch: Dispatch }) {
  const ch = f.challenge!;
  const hears = ch.mode === 'listen' || ch.mode === 'dictate';
  // Слух — звук сразу; у остальных звук после ответа (иначе «Узнать» стало бы слухом).
  useEffect(() => {
    if (hears) speak(ch.audio);
  }, [hears, ch.audio]);
  return (
    <div className="eg-challenge">
      <p className="eg-task">
        {MODE_LABEL[ch.mode]} · {MODE_HINT[ch.mode]}
      </p>
      {hears ? (
        <div className="eg-row eg-center">
          <Button variant="default" onClick={() => speak(ch.audio)} aria-label="Ещё раз">
            <Volume2 size={18} aria-hidden /> Ещё раз
          </Button>
          <Button variant="bare" onClick={() => speak(ch.audio, true)}>
            медленно
          </Button>
        </div>
      ) : (
        <p className={cn('eg-prompt', ch.mode === 'recognize' && 'eg-prompt-en')} lang={ch.mode === 'recognize' ? 'en' : 'ru'}>
          {ch.prompt}
        </p>
      )}
      <CritBar ms={critWindow(ch.mode, run.relics, run.fog)} at={f.shownAt} />
      {ch.options ? (
        <Options f={f} dispatch={dispatch} />
      ) : ch.mode === 'speak' ? (
        <SpeakAnswer key={f.shownAt} f={f} dispatch={dispatch} />
      ) : ch.mode === 'order' ? (
        <OrderAnswer key={f.shownAt} f={f} dispatch={dispatch} />
      ) : (
        <TextAnswer key={f.shownAt} f={f} dispatch={dispatch} />
      )}
    </div>
  );
}

/** Итог ответа: верно — коротко и дальше само; неверно — карточка целиком и «Дальше». */
function Result({ f, dispatch }: { f: Fight; dispatch: Dispatch }) {
  const last = f.last!;
  const card = f.card;
  const ok = last.outcome !== 'wrong';
  useEffect(() => {
    if (card && f.mode !== 'listen' && f.mode !== 'dictate') speak(f.mode === 'order' && card.example ? card.example[0] : card.en);
  }, [card, f.mode]);
  useEffect(() => {
    if (!ok || f.foe.hp <= 0) return;
    const t = window.setTimeout(() => dispatch({ type: 'next', now: Date.now() }), AUTO_NEXT_MS);
    return () => window.clearTimeout(t);
  }, [ok, f.foe.hp, dispatch]);
  return (
    <div className={cn('eg-result', ok ? 'eg-result-ok' : 'eg-result-bad')}>
      {card ? (
        <>
          <p className="eg-word" lang="en">
            {card.en} <Say text={card.en} />
          </p>
          <p className="eg-word-ru">{card.ru}</p>
          {!ok && card.example ? (
            <p className="eg-example">
              <span lang="en">{card.example[0]}</span>
              <span className="muted">{card.example[1]}</span>
            </p>
          ) : null}
        </>
      ) : null}
      <p className="eg-hits">
        {ok ? <span className="eg-dmg">−{last.damage}</span> : <span className="neg">мимо</span>}
        {last.crit ? <span className="eg-critlabel">крит</span> : null}
        {last.outcome === 'typo' ? <span className="muted">почти — опечатка</span> : null}
        {last.taken > 0 ? <span className="neg">♥ −{last.taken}</span> : null}
        {last.blockedBy ? <span className="muted">{last.blockedBy === 'umbrella' ? 'Зонт простил ошибку' : 'Зонт закрыл удар'}</span> : null}
        {last.healed > 0 ? <span className="pos">♥ +{last.healed}</span> : null}
      </p>
      {!ok || f.foe.hp <= 0 ? (
        <Button variant="solid" autoFocus onClick={() => dispatch({ type: 'next', now: Date.now() })}>
          {f.foe.hp <= 0 ? 'Туман рассеян' : 'Дальше'}
        </Button>
      ) : null}
    </div>
  );
}

function Intro({ f, dispatch }: { f: Fight; dispatch: Dispatch }) {
  const card = f.card!;
  useEffect(() => speak(card.en), [card.en]);
  return (
    <div className="eg-intro">
      <p className="eg-task">Новое слово</p>
      <p className="eg-word" lang="en">
        {card.en} <Say text={card.en} /> <Say text={card.en} slow />
      </p>
      <p className="eg-word-ru">{card.ru}</p>
      {card.example ? (
        <p className="eg-example">
          <span lang="en">{card.example[0]}</span> <Say text={card.example[0]} />
          <span className="muted">{card.example[1]}</span>
        </p>
      ) : null}
      <Button variant="solid" autoFocus onClick={() => dispatch({ type: 'next', now: Date.now() })}>
        Понял
      </Button>
    </div>
  );
}

function Attacks({ run, f, dispatch }: { run: RunState; f: Fight; dispatch: Dispatch }) {
  const modes = modesOf(run);
  return (
    <div className="eg-choose">
      <p className="eg-tag">{f.card ? tagOf(f.card, f.via) : ''}</p>
      <div className="eg-attacks">
        {modes.map((m, i) => (
          <Button key={m} variant="default" onClick={() => dispatch({ type: 'mode', mode: m, now: Date.now() })}>
            <span className="eg-key">{i + 1}</span>
            <b>{MODE_LABEL[m]}</b>
            <span className="eg-attack-dmg">
              {previewDamage(run, m)}
              {f.foe.weak === m ? ' ▲' : f.foe.resist === m ? ' ▼' : ''}
            </span>
            <span className="muted">{MODE_HINT[m]}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function BossTurn({ run, f, dispatch }: { run: RunState; f: Fight; dispatch: Dispatch }) {
  const ex = currentExercise(run);
  if (!ex) return null;
  return (
    <div className="eg-boss-turn">
      <CritBar ms={critWindow(ex.type, run.relics, run.fog)} at={f.shownAt} />
      <ExerciseView
        key={`${ex.id}:${f.shownAt}`}
        exercise={ex}
        onAnswer={(correct) => dispatch({ type: 'exercise', correct, now: Date.now() })}
        onNext={() => dispatch({ type: 'next', now: Date.now() })}
      />
      {f.phase === 'result' && f.last ? (
        <p className="eg-hits">
          {f.last.outcome !== 'wrong' ? <span className="eg-dmg">−{f.last.damage}</span> : null}
          {f.last.crit ? <span className="eg-critlabel">крит</span> : null}
          {f.last.taken > 0 ? <span className="neg">♥ −{f.last.taken}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

export function FightView({ run, f, dispatch }: { run: RunState; f: Fight; dispatch: Dispatch }) {
  const hits = run.stats.damage + run.stats.modes.recall.wrong + run.stats.boss.wrong;

  // Клавиатура: 1–6 — удар или вариант, Enter — дальше, пробел — звук ещё раз.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const n = Number(e.key);
      if (f.phase === 'choose' && n >= 1) {
        const m: Mode | undefined = modesOf(run)[n - 1];
        if (m) dispatch({ type: 'mode', mode: m, now: Date.now() });
      } else if (f.phase === 'answer' && f.challenge?.options && n >= 1 && n <= f.challenge.options.length && !typing) {
        if (!f.hidden?.includes(n - 1)) dispatch({ type: 'answer', value: n - 1, now: Date.now() });
      } else if (e.key === ' ' && !typing && f.phase === 'answer' && f.challenge) {
        e.preventDefault();
        speak(f.challenge.audio);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="eg-fight">
      <FoeHead f={f} />
      <Fog density={f.foe.hp / f.foe.maxHp} hit={hits}>
        {f.foe.kind === 'boss' ? (
          <BossTurn run={run} f={f} dispatch={dispatch} />
        ) : f.phase === 'intro' ? (
          <Intro f={f} dispatch={dispatch} />
        ) : f.phase === 'choose' ? (
          <Attacks run={run} f={f} dispatch={dispatch} />
        ) : f.phase === 'answer' ? (
          <Challenge key={f.shownAt} run={run} f={f} dispatch={dispatch} />
        ) : (
          <Result f={f} dispatch={dispatch} />
        )}
      </Fog>
    </section>
  );
}
