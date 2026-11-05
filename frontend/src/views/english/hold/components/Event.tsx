'use client';

import { useState } from 'react';
import { ICONS, type IconId } from '../icons';
import { EVENT_TITLE as TITLE, answerEvent, type EventId } from '../model/events';
import { faceOf, spendMorale, type HoldState } from '../model/rules';
import { saveGame } from '../model/store';
import { Tap } from './Words';

/**
 * Событие утра — трудное решение (model/events.ts). Окно того же вида, что гость у ворот: заголовок,
 * картинка, текст по-английски (слово — по нажатию, всё — за −1 настроения), ответы фразами.
 * После ответа — что случилось, строками доклада.
 */

const ICON: Record<EventId, IconId> = {
  girl: 'child',
  storm: 'tent',
  fever: 'heart',
  water: 'water',
  soldiers: 'brute',
  stranger: 'hood',
  house: 'village',
  body: 'skull',
  neighbors: 'wood',
  river: 'lake',
  song: 'fire',
  theft: 'food',
};

function Scene({ id, face }: { id: EventId; face?: IconId }) {
  const W = 390;
  const H = 170;
  return (
    <svg className="ah-scene ah-event-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width={W} height={H} fill="#1a130c" />
      <rect width={W} height={H} filter="url(#ah-terrain)" opacity=".7" />
      <circle cx={W / 2} cy={H / 2} r="90" fill="url(#ah-light)" className="ah-glow" />
      {face ? (
        <svg x={W / 2 - 110} y={H / 2 - 38} width="76" height="76" viewBox="0 0 512 512">
          <path d={ICONS[face]} fill="url(#ah-bone)" />
        </svg>
      ) : null}
      <svg x={W / 2 - (face ? 10 : 50)} y={H / 2 - 50} width="100" height="100" viewBox="0 0 512 512">
        <path d={ICONS[ICON[id]]} fill="url(#ah-bone)" />
      </svg>
      <rect width={W} height={H} fill="url(#ah-vig)" />
    </svg>
  );
}

export function EventView({ s }: { s: HoldState }) {
  const e = s.event!;
  const [result, setResult] = useState<{ state: HoldState; lines: string[] } | null>(null);
  const [ru, setRu] = useState(false);
  const who = s.people.find((p) => p.id === e.who?.[0]);
  return (
    <div className="ah-sheet-back ah-gate-back">
      <div className="ah-gate" role="dialog" aria-label={TITLE[e.id]}>
        <div className="ah-banner">
          <Tap text={TITLE[e.id].toUpperCase()} />
        </div>
        <Scene id={e.id} face={who ? faceOf(who) : undefined} />
        <p className="ah-gate-detail ah-event-text">
          <Tap text={e.text} />
          {ru ? <span className="ah-ru">{e.ru}</span> : null}
        </p>
        {!result && !ru ? (
          <button
            type="button"
            className="ah-translate"
            onClick={() => {
              saveGame(spendMorale(s));
              setRu(true);
            }}
          >
            Translate · −1 morale
          </button>
        ) : null}
        {result ? (
          <>
            <ul className="ah-gate-result">
              {result.lines.map((l, i) => (
                <li key={i}>
                  <Tap text={l} />
                </li>
              ))}
            </ul>
            <button type="button" className="ah-btn" onClick={() => saveGame(result.state)}>
              Continue
            </button>
          </>
        ) : (
          <div className="ah-gate-answers">
            <p className="ah-lab">
              <Tap text="What do you say?" />
            </p>
            {e.options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="ah-gate-answer ah-frame"
                onClick={() => setResult(answerEvent(s, o.id))}
              >
                {o.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
