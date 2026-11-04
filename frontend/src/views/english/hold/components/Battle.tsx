'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils/css';
import { ICONS, type IconId } from '../icons';
import {
  BVERBS,
  MAX_ROUNDS,
  REACTION_HINT,
  ROLE_NAME,
  THIRD,
  battleOrder,
  fight,
  finishBattle,
  intentOf,
  react,
  reactionChoices,
  type BVerb,
  type Enemy,
  type Reaction,
} from '../model/battle';
import { MAX_HP, endDay, present, type HoldState, type Person, type PersonId } from '../model/rules';
import { saveGame } from '../model/store';
import { Tap, TileHint } from './Words';

/** Сколько длится вспышка удара: не успел выбрать защиту — удар прошёл. */
export const PARRY_MS = 4000;
const FLASH_MS = 1100;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

function Ic({ id, className }: { id: IconId; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('ah-ic', className)} aria-hidden>
      <path d={ICONS[id]} />
    </svg>
  );
}

const ENEMY_ICON: Record<Enemy['kind'], IconId> = { wolf: 'wolf', archer: 'archer', brute: 'brute', thief: 'thief' };

function Pips({ n, max, className }: { n: number; max: number; className?: string }) {
  return (
    <span className={cn('ah-hp', className)} aria-label={`${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={cn(i < n && 'on')} />
      ))}
    </span>
  );
}

function EnemyCard({ s, e }: { s: HoldState; e: Enemy }) {
  const said = intentOf(s, e);
  return (
    <div className={cn('ah-foe ah-frame', e.hp <= 0 && 'ah-foe-dead')}>
      <span className="ah-token ah-token-foe">
        <Ic id={ENEMY_ICON[e.kind]} />
      </span>
      <span className="ah-foe-body">
        <b>
          <Tap text={e.name} />
        </b>
        <Pips n={e.hp} max={e.maxHp} />
      </span>
      {said ? (
        <p className="ah-say">
          <Tap text={said} />
        </p>
      ) : e.hp <= 0 ? (
        <p className="ah-foe-out">
          <Tap text="dead" />
        </p>
      ) : null}
    </div>
  );
}

function FighterCard({ s, p, active, onPick }: { s: HoldState; p: Person; active: boolean; onPick: () => void }) {
  const b = s.battle!;
  const o = b.orders[p.id];
  const label = o
    ? (b.enemies.find((e) => e.id === o.target)?.name ?? s.people.find((x) => x.id === o.target)?.name ?? null)
    : null;
  const down = p.hp <= 0;
  return (
    <button type="button" className={cn('ah-fighter ah-frame', active && 'on', down && 'down')} onClick={onPick} disabled={down}>
      <span className="ah-por">
        <Ic id={p.id} />
      </span>
      <span className="ah-cn">
        <b>
          {p.name} · <span>{ROLE_NAME[p.role]}</span>
        </b>
        <small>{down ? 'cannot fight' : o ? `“${o.verb} ${label}”` : 'no order yet'}</small>
      </span>
      <Pips n={Math.max(0, p.hp)} max={MAX_HP} />
    </button>
  );
}

function OrderPanel({ s, id, onDone }: { s: HoldState; id: PersonId; onDone: () => void }) {
  const b = s.battle!;
  const p = s.people.find((x) => x.id === id)!;
  const [verb, setVerb] = useState<BVerb | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const targets = [
    ...b.enemies.filter((e) => e.hp > 0).map((e) => e.name),
    ...present(s)
      .filter((x) => x.hp > 0)
      .map((x) => x.name),
  ];
  const give = () => {
    if (!verb || !target) return;
    const r = battleOrder(s, id, verb, target);
    saveGame(r.state);
    if (r.ok) onDone();
    else {
      setWrong(`${p.name} does not understand: “${verb} ${target}”?`);
      setShake((n) => n + 1);
    }
  };
  return (
    <div className="ah-border ah-frame">
      <div key={shake} className={cn('ah-phrase', shake > 0 && 'ah-shake')}>
        <span className="ah-w f">{p.name},</span>
        <button type="button" className={cn('ah-w', verb && 'f')} onClick={() => setVerb(null)}>
          {verb ?? '· · ·'}
        </button>
        <button type="button" className={cn('ah-w', target && 'f')} onClick={() => setTarget(null)}>
          {target ?? '· · ·'}
        </button>
      </div>
      {wrong ? <p className="ah-wrong">{wrong}</p> : <TileHint word={hint} />}
      <div className="ah-tiles">
        {BVERBS.map((v) => (
          <button
            key={v}
            type="button"
            className={cn('ah-tile', verb === v && 'used')}
            onClick={() => (setVerb(v), setHint(v), setWrong(null))}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="ah-tiles">
        {targets.map((t) => (
          <button
            key={t}
            type="button"
            className={cn('ah-tile', target === t && 'used')}
            onClick={() => (setTarget(t), setHint(t), setWrong(null))}
          >
            {t}
          </button>
        ))}
      </div>
      <button type="button" className="ah-btn" disabled={!verb || !target} onClick={give}>
        Give order
      </button>
    </div>
  );
}

/** Вспышка удара: глагол в сжимающемся кольце и три защиты; время вышло — удар прошёл. */
function Parry({ s, index, onAnswer }: { s: HoldState; index: number; onAnswer: (r: Reaction | null) => void }) {
  const b = s.battle!;
  const h = b.hits[index];
  const e = b.enemies.find((x) => x.id === h.enemy)!;
  const p = s.people.find((x) => x.id === h.taker)!;
  const choices = reactionChoices(h, index);
  // Таймер — один на вспышку (компонент пересоздаётся ключом на каждый удар); ответ — через реф,
  // чтобы перерисовка родителя не заводила его заново.
  const answer = useRef(onAnswer);
  useEffect(() => {
    answer.current = onAnswer;
  });
  useEffect(() => {
    const t = window.setTimeout(() => answer.current(null), PARRY_MS);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="ah-parry" role="dialog" aria-label="Defend yourself">
      <p className="ah-parry-who">
        <Tap text={`${e.name} → ${p.name}`} />
      </p>
      <span className="ah-parry-foe">
        <Ic id={ENEMY_ICON[e.kind]} />
      </span>
      <div className="ah-ring" style={{ animationDuration: `${PARRY_MS}ms` }}>
        <b>{THIRD[h.verb].toUpperCase()}</b>
      </div>
      <p className="ah-parry-ask">
        <Tap text={`${p.name}! Quick — how do you survive?`} />
      </p>
      <div className="ah-acts">
        {choices.map((c) => (
          <button key={c} type="button" className="ah-act ah-frame" onClick={() => onAnswer(c)}>
            <Ic id={c} />
            <b>{c}</b>
            <small>{REACTION_HINT[c]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BattleView({ s }: { s: HoldState }) {
  const b = s.battle!;
  const alive = present(s).filter((p) => p.hp > 0);
  const [picked, setPicked] = useState<PersonId | null>(null);
  // После каждого ответа на удар — короткая пауза со строкой исхода, потом следующий удар.
  const [flash, setFlash] = useState<string | null>(null);
  const pending = b.phase === 'enemy' ? b.hits.findIndex((h) => !h.done) : -1;
  const answer = (r: Reaction | null) => {
    const n = react(s, pending, r);
    saveGame(n);
    setFlash(n.battle?.last.at(-1) ?? null);
  };
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flash]);

  const next = alive.find((p) => !b.orders[p.id])?.id ?? null;
  const active = b.phase === 'orders' ? (picked && alive.some((p) => p.id === picked) ? picked : next) : null;
  const ready = alive.every((p) => b.orders[p.id]);

  return (
    <section className="ah-battle">
      <div className="ah-banner">
        <Tap text="NIGHT RAID · ROUND" /> {ROMAN[b.round]}{' '}
        <small>
          <Tap text="of" /> {ROMAN[MAX_ROUNDS]}
        </small>
      </div>
      <div className="ah-foes">
        {b.enemies.map((e) => (
          <EnemyCard key={e.id} s={s} e={e} />
        ))}
      </div>
      {b.last.length ? (
        <ul className="ah-blog">
          {b.last.map((l, i) => (
            <li key={`${b.round}:${i}`}>
              <Tap text={l} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="ah-fighters">
        {present(s).map((p) => (
          <FighterCard key={p.id} s={s} p={p} active={active === p.id} onPick={() => setPicked(p.id)} />
        ))}
      </div>

      {b.phase === 'orders' ? (
        <div className="ah-endbar">
          {active && !(ready && picked === null) ? (
            <OrderPanel key={`${b.round}:${active}`} s={s} id={active} onDone={() => setPicked(null)} />
          ) : null}
          {ready ? (
            <button type="button" className="ah-btn ah-btn-fight" onClick={() => saveGame(fight(s))}>
              Fight!
            </button>
          ) : null}
        </div>
      ) : null}

      {b.phase === 'over' ? (
        <div className="ah-endbar">
          <div className={cn('ah-verdict ah-frame', b.outcome === 'won' ? 'good' : 'bad')}>
            {b.outcome === 'won'
              ? 'The raid is beaten'
              : b.outcome === 'fled'
                ? 'They ran away with loot'
                : 'The camp has fallen tonight'}
          </div>
          <button type="button" className="ah-btn" onClick={() => saveGame(endDay(finishBattle(s)))}>
            Wait for the morning
          </button>
        </div>
      ) : null}

      {flash ? (
        <div className="ah-flash" aria-live="polite">
          {flash}
        </div>
      ) : pending >= 0 ? (
        <Parry key={`${b.round}:${pending}`} s={s} index={pending} onAnswer={answer} />
      ) : null}
    </section>
  );
}
