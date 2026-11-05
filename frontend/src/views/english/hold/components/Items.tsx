'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/utils/css';
import { ICONS, type IconId } from '../icons';
import {
  ITEM_IDS,
  SLOTS,
  SLOT_NAME,
  countOf,
  giveGear,
  itemOf,
  needsPerson,
  slotOf,
  spendItem,
  takeGear,
  type ItemId,
  type Kind,
  type Slot,
} from '../model/items';
import { faceOf, type HoldState, type Person } from '../model/rules';
import { saveGame } from '../model/store';
import { Tap } from './Words';

/**
 * Вкладка «Items» — вещи лагеря по разделам: оружие, одежда, инструменты, припасы. У снаряжения —
 * «Give» и выбор человека (вещь встаёт в свой слот), у лекарств и вещей для души — «Use» на человека,
 * у еды — «Store» в общий запас, у музыки — «Share» на всех. Ниже — что носит каждый, нажатие по
 * вещи возвращает её в запасы. Что случилось — строкой по-английски сверху.
 */

function Ic({ id }: { id: IconId }) {
  return (
    <svg viewBox="0 0 512 512" className="ah-ic" aria-hidden>
      <path d={ICONS[id]} />
    </svg>
  );
}

const KINDS: readonly Kind[] = ['weapon', 'armor', 'tool', 'supply'];
const SLOT_WORD: Record<Slot, string> = { weapon: 'weapon', armor: 'clothes', tool: 'tool' };

const actionOf = (id: ItemId) => {
  const d = itemOf(id);
  if (d.kind !== 'supply') return 'Give';
  if (needsPerson(id)) return 'Use';
  return d.food ? 'Store' : 'Share';
};

export function ItemsView({ s }: { s: HoldState }) {
  const [pick, setPick] = useState<ItemId | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const crew = s.people.filter((p) => p.status === 'ok');
  const done = (r: { state: HoldState; line: string } | null) => {
    if (r) {
      saveGame(r.state);
      setSaid(r.line);
    }
  };
  const press = (id: ItemId) => {
    if (itemOf(id).kind === 'supply' && !needsPerson(id)) done(spendItem(s, id));
    else setPick(id);
  };
  const apply = (id: ItemId, p: Person) => {
    done(itemOf(id).kind === 'supply' ? spendItem(s, id, p.id) : giveGear(s, id, p.id));
    setPick(null);
  };
  const any = ITEM_IDS.some((id) => countOf(s, id) > 0);
  const pickDef = pick ? itemOf(pick) : null;
  return (
    <section className="ah-items">
      {said ? (
        <p className="ah-items-said">
          <Tap text={said} />
        </p>
      ) : null}
      {!any ? (
        <p className="ah-lands-hint">
          <Tap text="We have nothing yet. Search places to find things." />
        </p>
      ) : null}
      {KINDS.map((kind) => {
        const ids = ITEM_IDS.filter((id) => itemOf(id).kind === kind && countOf(s, id) > 0);
        if (!ids.length) return null;
        return (
          <div key={kind} className="ah-items-sec">
            <p className="ah-lands-title">
              <Tap text={SLOT_NAME[kind]} />
            </p>
            <div className="ah-items-grid">
              {ids.map((id) => {
                const def = itemOf(id);
                return (
                  <div key={id} className={cn('ah-item ah-frame', def.rare && 'ah-item-rare')}>
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
                    <button type="button" className="ah-item-act" onClick={() => press(id)}>
                      {actionOf(id)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="ah-lands-title">
        <Tap text="What people carry" />
      </p>
      <div className="ah-items-grid">
        {crew.map((p) => (
          <div key={p.id} className="ah-carry ah-frame">
            <span className="ah-item-ic">
              <Ic id={faceOf(p)} />
            </span>
            <span className="ah-carry-tx">
              <b>{p.name}</b>
              <span className="ah-slots">
                {SLOTS.map((sl) => {
                  const g = slotOf(p, sl);
                  return g ? (
                    <button
                      key={sl}
                      type="button"
                      className="ah-slot on"
                      title="Take back"
                      onClick={() => done(takeGear(s, p.id, sl))}
                    >
                      <Ic id={itemOf(g).icon} />
                      <span>{itemOf(g).name}</span>
                    </button>
                  ) : (
                    <span key={sl} className="ah-slot">
                      <span>no {SLOT_WORD[sl]}</span>
                    </span>
                  );
                })}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="ah-lands-hint">
        <Tap text="Tap a thing that a person carries to take it back." />
      </p>
      {pick && pickDef ? (
        <div className="ah-sheet-back" onClick={() => setPick(null)}>
          <div className="ah-sheet ah-frame" role="dialog" aria-label="Who?" onClick={(e) => e.stopPropagation()}>
            <p className="ah-who-ask">
              <Tap text={pickDef.kind === 'supply' ? `Who needs the ${pickDef.name}?` : `Who gets the ${pickDef.name}?`} />
            </p>
            <p className="ah-lands-hint">
              <Tap text={pickDef.text} />
            </p>
            <div className="ah-who">
              {crew
                .filter((p) => !p.away)
                .map((p) => {
                  const g = pickDef.kind === 'supply' ? null : slotOf(p, pickDef.kind as Slot);
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
                          {pickDef.kind === 'supply'
                            ? `health ${p.hp} · mood ${p.morale}`
                            : g
                              ? `has: ${itemOf(g).name}`
                              : `no ${SLOT_WORD[pickDef.kind as Slot]} yet`}
                        </small>
                      </span>
                      <span className="ah-hp" aria-hidden>
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
