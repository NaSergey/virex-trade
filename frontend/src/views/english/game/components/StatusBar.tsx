'use client';

import { useState } from 'react';
import { Pause } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { CHARACTERS } from '../content/characters';
import { ITEMS, RELICS } from '../content/relics';
import { WEATHER } from '../content/weather';
import { comboMult } from '../model/combat';
import type { Action, RunState } from '../model/engine';
import { setSoundOn, soundOn } from '../sound';

type Dispatch = (a: Action) => void;

const mult = (x: number) => `×${x.toFixed(1).replace('.', ',')}`;

/** Здоровье, серия, шиллинги, карман и находки — над любым экраном забега. */
export function StatusBar({ run, dispatch }: { run: RunState; dispatch: Dispatch }) {
  const [open, setOpen] = useState<'relics' | 'pause' | null>(null);
  const [sound, setSound] = useState(soundOn);
  const [quitting, setQuitting] = useState(false);
  const toggle = (what: 'relics' | 'pause') => setOpen(open === what ? null : what);

  return (
    <div className="eg-status">
      <div className="eg-status-row">
        <div className="eg-hp" aria-label={`Здоровье ${run.hp} из ${run.maxHp}`}>
          <span>♥ {run.hp}/{run.maxHp}</span>
          <div className="eg-bar eg-bar-hp">
            <i style={{ transform: `scaleX(${run.hp / run.maxHp})` }} />
          </div>
        </div>
        <span className="eg-stat" title="Серия верных подряд">
          серия {mult(comboMult(run.combo, run.relics, run.weather))}
        </span>
        <span className="eg-stat" title="Шиллинги">
          {run.coins} ш
        </span>
        <Button variant="bare" tight onClick={() => toggle('relics')} aria-expanded={open === 'relics'}>
          находки {run.relics.length}
        </Button>
        <Button variant="bare" tight onClick={() => toggle('pause')} aria-label="Пауза" aria-expanded={open === 'pause'}>
          <Pause size={16} aria-hidden />
        </Button>
      </div>
      {run.items.length > 0 ? (
        <div className="eg-pocket">
          {run.items.map((item, i) => (
            <Button
              key={`${item}${i}`}
              variant="default"
              tight
              title={ITEMS[item].text}
              onClick={() => dispatch({ type: 'item', index: i, now: Date.now() })}
            >
              {ITEMS[item].name}
            </Button>
          ))}
          {run.relics.includes('dictionary') ? (
            <Button variant="bare" tight onClick={() => dispatch({ type: 'hint', now: Date.now() })}>
              словарь
            </Button>
          ) : null}
        </div>
      ) : null}
      {open === 'relics' ? (
        <ul className="eg-sheet">
          {run.relics.map((id) => (
            <li key={id}>
              <b>{RELICS[id].name}</b> — {RELICS[id].text}
            </li>
          ))}
          <li className="muted">
            {CHARACTERS[run.character].name}: {CHARACTERS[run.character].perk}. Погода — {WEATHER[run.weather].name.toLowerCase()}
            : {WEATHER[run.weather].text}.
          </li>
        </ul>
      ) : null}
      {open === 'pause' ? (
        <div className="eg-sheet eg-pause">
          <p className="muted">
            Удар — это ответ: чем труднее ответ, тем сильнее удар. Ошибся — противник бьёт сразу. Медлишь — он бьёт по
            счётчику. Интервал карточки продлевает только «Вспомнить» и «Сказать».
          </p>
          <div className="eg-row">
            <Button variant="solid" onClick={() => setOpen(null)}>
              Продолжить
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setSoundOn(!sound);
                setSound(!sound);
              }}
            >
              Звук: {sound ? 'вкл' : 'выкл'}
            </Button>
            <Button
              variant="risk"
              onClick={() => (quitting ? dispatch({ type: 'quit', now: Date.now() }) : setQuitting(true))}
            >
              {quitting ? 'Точно сдаться?' : 'Сдаться'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
