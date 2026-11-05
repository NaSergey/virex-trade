'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/utils/css';
import { ICONS, type IconId } from '../icons';
import { ITEMS, ITEM_IDS, countOf, gearOf, giveGear, takeGear, spendItem, type ItemId } from '../model/items';
import { faceOf, type HoldState, type Person } from '../model/rules';
import { saveGame } from '../model/store';
import { Tap } from './Words';

/**
 * Вкладка «Items» — вещи лагеря. Карточка вещи: значок, имя, что даёт и кнопка — «Use» у
 * расходных, «Give» у снаряжения; дальше выбор человека. Ниже — кто что носит, с «Take back».
 * Что случилось — строкой по-английски над списком.
 */

function Ic({ id }: { id: IconId }) {
  return (
    <svg viewBox="0 0 512 512" className="ah-ic" aria-hidden>
      <path d={ICONS[id]} />
    </svg>
  );
}

export function ItemsView({ s }: { s: HoldState }) {
  const [pick, setPick] = useState<ItemId | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const have = ITEM_IDS.filter((id) => countOf(s, id) > 0);
  const crew = s.people.filter((p) => p.status === 'ok');
  const carrying = crew.filter((p) => gearOf(p));
  const apply = (id: ItemId, p: Person) => {
    const r = ITEMS[id].kind === 'use' ? spendItem(s, id, p.id) : giveGear(s, id, p.id);
    if (r) {
      saveGame(r.state);
      setSaid(r.line);
    }
    setPick(null);
  };
  return (
    <section className="ah-items">
      <p className="ah-lands-title">
        <Tap text="Things we have" />
      </p>
      {said ? (
        <p className="ah-items-said">
          <Tap text={said} />
        </p>
      ) : null}
      {have.length ? (
        <div className="ah-items-grid">
          {have.map((id) => {
            const def = ITEMS[id];
            return (
              <div key={id} className="ah-item ah-frame">
                <span className="ah-item-ic">
                  <Ic id={def.icon} />
                  {countOf(s, id) > 1 ? <b>×{countOf(s, id)}</b> : null}
                </span>
                <span className="ah-item-tx">
                  <b>
                    <Tap text={def.name} />
                  </b>
                  <small>
                    <Tap text={def.text} />
                  </small>
                </span>
                <button type="button" className="ah-item-act" onClick={() => setPick(id)}>
                  {def.kind === 'use' ? 'Use' : 'Give'}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="ah-lands-hint">
          <Tap text="We have nothing yet. Search places to find things." />
        </p>
      )}
      {carrying.length ? (
        <>
          <p className="ah-lands-title">
            <Tap text="Who carries what" />
          </p>
          <div className="ah-items-grid">
            {carrying.map((p) => {
              const g = gearOf(p)!;
              return (
                <div key={p.id} className="ah-item ah-frame">
                  <span className="ah-item-ic">
                    <Ic id={faceOf(p)} />
                  </span>
                  <span className="ah-item-tx">
                    <b>
                      <Tap text={`${p.name} has the ${ITEMS[g].name}`} />
                    </b>
                    <small>
                      <Tap text={ITEMS[g].text} />
                    </small>
                  </span>
                  <button
                    type="button"
                    className="ah-item-act"
                    onClick={() => {
                      const r = takeGear(s, p.id);
                      if (r) {
                        saveGame(r.state);
                        setSaid(r.line);
                      }
                    }}
                  >
                    Take back
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {pick ? (
        <div className="ah-sheet-back" onClick={() => setPick(null)}>
          <div className="ah-sheet ah-frame" role="dialog" aria-label="Who?" onClick={(e) => e.stopPropagation()}>
            <p className="ah-who-ask">
              <Tap
                text={ITEMS[pick].kind === 'use' ? `Who needs the ${ITEMS[pick].name}?` : `Who gets the ${ITEMS[pick].name}?`}
              />
            </p>
            <div className="ah-who">
              {crew
                .filter((p) => !p.away)
                .map((p) => {
                  const g = gearOf(p);
                  return (
                    <button key={p.id} type="button" className="ah-crew ah-frame" onClick={() => apply(pick, p)}>
                      <span className="ah-por">
                        <Ic id={faceOf(p)} />
                      </span>
                      <span className="ah-cn">
                        <b>
                          {p.name} · <span>{p.role}</span>
                        </b>
                        <small>
                          {ITEMS[pick].kind === 'use'
                            ? `health ${p.hp} · mood ${p.morale}`
                            : g
                              ? `has: ${ITEMS[g].name}`
                              : 'has nothing'}
                        </small>
                      </span>
                      <span className={cn('ah-hp')} aria-hidden>
                        {Array.from({ length: 5 }, (_, i) => (
                          <i key={i} className={cn(i < p.hp && 'on')} />
                        ))}
                      </span>
                    </button>
                  );
                })}
            </div>
            <button type="button" className="ah-btn ah-btn-ghost" onClick={() => setPick(null)}>
              Back
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
