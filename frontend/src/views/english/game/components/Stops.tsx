'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Say } from '../../components/Say';
import { ITEMS, POCKET, RELICS } from '../content/relics';
import { MODE_LABEL, shillings } from '../labels';
import { FIGHT_MODES, type Action, type Offer, type RewardOption, type RunState, type Screen } from '../model/engine';
import type { Mode } from '../model/types';

type Dispatch = (a: Action) => void;

/** Какой удар заточить: четыре кнопки вместо окна. */
function ModePick({ onPick, onCancel }: { onPick: (m: Mode) => void; onCancel: () => void }) {
  return (
    <div className="eg-modepick">
      <p className="muted">Какой удар заточить (+1 к урону)?</p>
      <div className="eg-row">
        {FIGHT_MODES.map((m) => (
          <Button key={m} variant="default" onClick={() => onPick(m)}>
            {MODE_LABEL[m]}
          </Button>
        ))}
        <Button variant="bare" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

const rewardText = (o: RewardOption): [string, string] => {
  switch (o.kind) {
    case 'maxhp':
      return ['Крепче', '+4 к макс. здоровью и +4 здоровья'];
    case 'sharpen':
      return ['Заточка', '+1 урона одному удару'];
    case 'coins':
      return ['Кошелёк', `+${shillings(o.n)}`];
    case 'heal':
      return ['Передышка', `+${o.n} здоровья`];
    case 'item':
      return [ITEMS[o.item].name, ITEMS[o.item].text];
  }
};

export function Reward({ sc, dispatch }: { sc: Extract<Screen, { kind: 'reward' }>; dispatch: Dispatch }) {
  const [sharpen, setSharpen] = useState<number | null>(null);
  return (
    <section className="eg-stop">
      <h2>Туман рассеян</h2>
      <p className="muted">+{shillings(sc.coins)}. Возьми одно:</p>
      <div className="eg-cards">
        {sc.options.map((o, i) => {
          const [title, text] = rewardText(o);
          return (
            <Button
              key={i}
              variant="default"
              onClick={() => (o.kind === 'sharpen' ? setSharpen(i) : dispatch({ type: 'reward', index: i }))}
            >
              <b>{title}</b>
              <span className="muted">{text}</span>
            </Button>
          );
        })}
      </div>
      {sharpen !== null ? (
        <ModePick onPick={(mode) => dispatch({ type: 'reward', index: sharpen, mode })} onCancel={() => setSharpen(null)} />
      ) : null}
      <Button variant="bare" onClick={() => dispatch({ type: 'next', now: Date.now() })}>
        Ничего не брать
      </Button>
    </section>
  );
}

const offerText = (o: Offer): [string, string] => {
  switch (o.kind) {
    case 'item':
      return [ITEMS[o.item].name, ITEMS[o.item].text];
    case 'relic':
      return [RELICS[o.relic].name, RELICS[o.relic].text];
    case 'heal':
      return ['Горячий обед', `+${o.n} здоровья`];
    case 'sharpen':
      return ['Заточка', '+1 урона одному удару'];
  }
};

export function Shop({ run, sc, dispatch }: { run: RunState; sc: Extract<Screen, { kind: 'shop' }>; dispatch: Dispatch }) {
  const [sharpen, setSharpen] = useState<number | null>(null);
  return (
    <section className="eg-stop">
      <h2>Лавка</h2>
      <p className="muted">
        У тебя {shillings(run.coins)}. Карман: {run.items.length} из {POCKET}.
      </p>
      <ul className="eg-shop">
        {sc.offers.map((o, i) => {
          const [title, text] = offerText(o);
          const full = o.kind === 'item' && run.items.length >= POCKET;
          return (
            <li key={i}>
              <div>
                <b>{title}</b>
                <span className="muted">{text}</span>
              </div>
              <Button
                variant="default"
                tight
                disabled={o.sold || run.coins < o.price || full}
                onClick={() => (o.kind === 'sharpen' ? setSharpen(i) : dispatch({ type: 'buy', index: i }))}
              >
                {o.sold ? 'куплено' : `${o.price} ш`}
              </Button>
            </li>
          );
        })}
      </ul>
      {sharpen !== null ? (
        <ModePick onPick={(mode) => dispatch({ type: 'buy', index: sharpen, mode })} onCancel={() => setSharpen(null)} />
      ) : null}
      <Button variant="solid" onClick={() => dispatch({ type: 'next', now: Date.now() })}>
        Дальше по линии
      </Button>
    </section>
  );
}

export function Rest({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const [train, setTrain] = useState(false);
  const share = run.relics.includes('kettle') ? 1 : run.fog >= 2 ? 0.2 : 0.3;
  const mistakes = Math.min(6, run.stats.mistakes.filter((id) => run.all.some((c) => c.id === id)).length);
  return (
    <section className="eg-stop">
      <h2>Скамейка</h2>
      <p className="muted">Одно из трёх.</p>
      <div className="eg-cards">
        <Button variant="default" onClick={() => dispatch({ type: 'rest', choice: 'sleep', now: Date.now() })}>
          <b>Отдохнуть</b>
          <span className="muted">+{Math.round(run.maxHp * share)} здоровья</span>
        </Button>
        <Button variant="default" onClick={() => setTrain(true)}>
          <b>Потренироваться</b>
          <span className="muted">+1 урона одному удару</span>
        </Button>
        <Button
          variant="default"
          disabled={mistakes === 0}
          onClick={() => dispatch({ type: 'rest', choice: 'review', now: Date.now() })}
        >
          <b>Повторить ошибки</b>
          <span className="muted">
            {mistakes > 0 ? `${mistakes} слов вводом, +3 здоровья за каждое верное` : 'ошибок в забеге не было'}
          </span>
        </Button>
      </div>
      {train ? (
        <ModePick
          onPick={(mode) => dispatch({ type: 'rest', choice: 'train', mode, now: Date.now() })}
          onCancel={() => setTrain(false)}
        />
      ) : null}
    </section>
  );
}

export function Find({ sc, dispatch }: { sc: Extract<Screen, { kind: 'find' }>; dispatch: Dispatch }) {
  return (
    <section className="eg-stop">
      <h2>Находка</h2>
      {sc.coins > 0 ? <p className="muted">+{shillings(sc.coins)}</p> : null}
      {sc.relics.length === 0 ? <p className="muted">Все находки уже у тебя.</p> : <p className="muted">Возьми одну.</p>}
      <div className="eg-cards">
        {sc.relics.map((id) => (
          <Button key={id} variant="default" onClick={() => dispatch({ type: 'pick', relic: id })}>
            <b>{RELICS[id].name}</b>
            <span className="muted">{RELICS[id].text}</span>
          </Button>
        ))}
      </div>
      <Button variant="bare" onClick={() => dispatch({ type: 'pick', relic: null })}>
        Дальше
      </Button>
    </section>
  );
}

export function Review({ sc, dispatch }: { sc: Extract<Screen, { kind: 'review' }>; dispatch: Dispatch }) {
  const [value, setValue] = useState('');
  const card = sc.cards[sc.i];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sc.last === null && value.trim()) dispatch({ type: 'answer', value, now: Date.now() });
    else if (sc.last !== null) {
      setValue('');
      dispatch({ type: 'next', now: Date.now() });
    }
  };
  return (
    <section className="eg-stop">
      <h2>
        Повтор ошибок · {sc.i + 1} из {sc.cards.length}
      </h2>
      <p className="eg-prompt">{card.ru}</p>
      <form className="eg-type" onSubmit={submit}>
        <Input
          autoFocus
          value={value}
          disabled={sc.last !== null}
          onChange={(e) => setValue(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          lang="en"
          aria-label="Слово по-английски"
        />
        {sc.last !== null ? (
          <p className={sc.last === 'wrong' ? 'neg' : 'pos'}>
            {sc.last === 'wrong' ? 'Верно так: ' : '+3 здоровья · '}
            <span lang="en">{card.en}</span> <Say text={card.en} />
          </p>
        ) : null}
        <div className="eg-row">
          <Button type="submit" variant="solid">
            {sc.last === null ? 'Проверить' : 'Дальше'}
          </Button>
        </div>
      </form>
      <p className="muted">Вылечено: {sc.healed}</p>
    </section>
  );
}
