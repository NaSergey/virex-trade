'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import localFont from 'next/font/local';
import { cn } from '@/shared/lib/utils/css';
import { BattleView } from './components/Battle';
import { CampScene, HoldDefs } from './components/CampScene';
import { Tap, TileHint, WordCard } from './components/Words';
import { Lands, ScoutReportView } from './components/Lands';
import { GateView } from './components/Gate';
import { PLACES } from './model/scout';
import { startBattle } from './model/battle';
import { CREDIT, ICONS, type IconId } from './icons';
import {
  BUILDINGS,
  DAYS,
  MAX_HP,
  OBJECT_GROUPS,
  ROLE_PERK,
  VERBS,
  clearOrder,
  defenseOf,
  endDay,
  giveOrder,
  morale,
  newGame,
  present,
  upkeep,
  type BuildingId,
  type HoldState,
  type Obj,
  type Person,
  type ResId,
  type Verb,
} from './model/rules';
import { saveGame, useGame } from './model/store';
import { setSoundOn, soundOn } from '../game/sound';
import { Volume2, VolumeX } from 'lucide-react';
import './hold.css';

const cinzel = localFont({ src: './fonts/cinzel.woff2', weight: '400 900', variable: '--ah-cin', display: 'swap' });
const garamond = localFont({
  src: [
    { path: './fonts/garamond.woff2', style: 'normal' },
    { path: './fonts/garamond-italic.woff2', style: 'italic' },
  ],
  weight: '400 800',
  variable: '--ah-gar',
  display: 'swap',
});

function Ic({ id, className }: { id: IconId; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('ah-ic', className)} aria-hidden>
      <path d={ICONS[id]} />
    </svg>
  );
}

const ROMAN = (n: number) => {
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, r] of map)
    while (n >= v) {
      out += r;
      n -= v;
    }
  return out;
};

/** Ashen Hold — второй игровой режим учебника (спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md). */
export function HoldPage() {
  const game = useGame();
  return (
    <div className={cn('ah', cinzel.variable, garamond.variable)}>
      <HoldDefs />
      <div className="ah-topline">
        <Link href="/english/game" className="ah-back">
          ← Mind the Gap
        </Link>
        <SoundToggle />
      </div>
      {game === undefined ? null : game === null ? <Title /> : <Camp s={game} />}
      <WordCard />
      <p className="ah-credit">{CREDIT}</p>
    </div>
  );
}

/** Звук — общий выключатель с первой игрой (`virex.english.game.sound`). */
const soundListeners = new Set<() => void>();
const subscribeSound = (l: () => void) => {
  soundListeners.add(l);
  return () => soundListeners.delete(l);
};

function SoundToggle() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => true);
  const setOn = (v: boolean) => {
    setSoundOn(v);
    soundListeners.forEach((l) => l());
  };
  return (
    <button
      type="button"
      className="ah-sound"
      aria-pressed={on}
      aria-label={on ? 'Sound on' : 'Sound off'}
      onClick={() => {
        setOn(!on);
      }}
    >
      {on ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
    </button>
  );
}

function Title() {
  return (
    <section className="ah-title">
      <p className="ah-kicker">
        <Tap text="a survival game in English" />
      </p>
      <h1>Ashen Hold</h1>
      <p className="ah-lede">
        <Tap text="Four people. Thirty days of winter. Give them orders in English — and keep them alive until the spring caravan comes." />
      </p>
      <button type="button" className="ah-btn" onClick={() => saveGame(newGame(Math.floor(Math.random() * 2 ** 31)))}>
        Begin
      </button>
    </section>
  );
}

const RES: { id: ResId; icon: IconId }[] = [
  { id: 'food', icon: 'food' },
  { id: 'water', icon: 'water' },
  { id: 'wood', icon: 'wood' },
  { id: 'iron', icon: 'iron' },
];

function Hud({ s }: { s: HoldState }) {
  const up = upkeep(s);
  const m = morale(s);
  return (
    <div className="ah-hud">
      <div className="ah-row">
        <span className="ah-plate ah-frame">
          <Tap text="DAY" /> {ROMAN(Math.min(s.day, DAYS))}{' '}
          <small>
            <Tap text="of" /> {ROMAN(DAYS)}
          </small>
        </span>
        <div className="ah-bar ah-frame" aria-label={`Morale ${m.toFixed(1)} of 10`}>
          <i className={cn(m <= 3 && 'low')} style={{ transform: `scaleX(${m / 10})` }} />
          <Tap text="MORALE" />
        </div>
      </div>
      <div className="ah-res">
        {RES.map(({ id, icon }) => {
          const minus = id === 'food' ? up.food : id === 'water' ? up.water : 0;
          const short = minus > s.res[id];
          return (
            <span key={id} className={cn('ah-frame', short && 'ah-short')} title={id}>
              <Ic id={icon} />
              <b>{s.res[id]}</b>
              {minus !== 0 ? <small className={minus > 0 ? 'neg' : 'pos'}>{minus > 0 ? `−${minus}` : `+${-minus}`}</small> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Night({ s }: { s: HoldState }) {
  const def = defenseOf(s);
  const seen = s.buildings.tower.done;
  const r = s.tonight;
  return (
    <div className={cn('ah-night ah-frame', seen && r && r.strength > def && 'ah-danger')}>
      <Ic id={seen && r ? (r.kind === 'wolves' ? 'wolf' : 'bandit') : 'torch'} />
      <Tap
        text={
          seen
            ? r
              ? `The watchtower sees ${r.kind} coming tonight. Their strength: ${r.strength}.`
              : 'The watchtower sees no one. The night will be quiet.'
            : 'Night will come. You cannot see who is out there.'
        }
      />
      <b title="Your defense tonight">
        <small>
          <Tap text="DEFENSE" />
        </small>
        {def}
      </b>
    </div>
  );
}

function CrewRow({ p, onPick }: { p: Person; onPick: () => void }) {
  const mood = p.morale >= 6 ? 'calm' : p.morale >= 3 ? 'afraid' : 'broken';
  if (p.status !== 'ok') {
    return (
      <div className="ah-crew ah-frame ah-crew-out">
        <span className="ah-por">
          <Ic id={p.id} />
        </span>
        <span className="ah-cn">
          <b>{p.name}</b>
          <small>
            <Tap text={p.status === 'dead' ? 'dead' : 'left the camp'} />
          </small>
        </span>
      </div>
    );
  }
  if (p.away) {
    return (
      <div className="ah-crew ah-frame ah-crew-away">
        <span className="ah-por">
          <Ic id={p.id} />
        </span>
        <span className="ah-cn">
          <b>
            {p.name} · <Tap text={p.role} />
          </b>
          <small>
            <Tap text={`scouting the ${PLACES[p.away.place].dir} · back tomorrow`} />
          </small>
        </span>
      </div>
    );
  }
  return (
    <button type="button" className={cn('ah-crew ah-frame', !p.order && 'ah-crew-idle')} onClick={onPick}>
      <span className="ah-por">
        <Ic id={p.id} />
      </span>
      <span className="ah-cn">
        <b>
          {p.name} · <span>{p.role}</span>
        </b>
        <small>{p.order ? `“${p.order.verb} ${p.order.object}”` : 'waiting for an order'}</small>
      </span>
      <span className="ah-side">
        <span className="ah-hp" aria-label={`Health ${p.hp} of ${MAX_HP}`}>
          {Array.from({ length: MAX_HP }, (_, i) => (
            <i key={i} className={cn(i < p.hp && 'on')} />
          ))}
        </span>
        <span className={cn('ah-mood', `ah-mood-${mood}`)}>{mood}</span>
      </span>
    </button>
  );
}

function OrderSheet({ s, p, onClose }: { s: HoldState; p: Person; onClose: () => void }) {
  const [verb, setVerb] = useState<Verb | null>(p.order?.verb ?? null);
  const [object, setObject] = useState<Obj | null>(p.order?.object ?? null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const give = () => {
    if (!verb || !object) return;
    const r = giveOrder(s, p.id, { verb, object });
    saveGame(r.state);
    if (r.ok) onClose();
    else {
      const place = object.replace(/^the /, '');
      setWrong(
        !r.ok && r.reason === 'unknown'
          ? `${p.name} does not know what is in the ${place}. Scout it first.`
          : !r.ok && r.reason === 'empty'
            ? `The ${place} is already empty.`
            : `${p.name} does not understand: “${verb} ${object}”?`,
      );
      setShake((n) => n + 1);
    }
  };
  return (
    <div className="ah-sheet-back" onClick={onClose}>
      <div className="ah-sheet ah-frame" role="dialog" aria-label={`Order for ${p.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="ah-sheet-head">
          <span className="ah-por">
            <Ic id={p.id} />
          </span>
          <span>
            <b>
              <Tap text={`ORDER FOR ${p.name.toUpperCase()}`} />
            </b>
            <small>
              <Tap text={`${p.role} · ${ROLE_PERK[p.role]}`} />
            </small>
          </span>
        </div>
        <div key={shake} className={cn('ah-phrase', shake > 0 && 'ah-shake')}>
          <span className="ah-w f">{p.name},</span>
          <button type="button" className={cn('ah-w', verb && 'f')} onClick={() => setVerb(null)}>
            {verb ?? '· · ·'}
          </button>
          <button type="button" className={cn('ah-w', object && 'f')} onClick={() => setObject(null)}>
            {object ?? '· · ·'}
          </button>
        </div>
        {wrong ? <p className="ah-wrong">{wrong}</p> : <TileHint word={hint} />}
        <div className="ah-tiles ah-tiles-grid ah-tiles-verbs">
          {VERBS.map((v) => (
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
        {OBJECT_GROUPS.map(([label, list]) => (
          <div key={label} className="ah-group">
            <span className="ah-group-label">{label}</span>
            <div className="ah-tiles ah-tiles-grid">
              {list.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={cn('ah-tile', object === o && 'used')}
                  onClick={() => (setObject(o), setHint(o), setWrong(null))}
                >
                  {o.replace(/^(by )?the /, '')}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="ah-sheet-actions">
          {p.order ? (
            <button
              type="button"
              className="ah-btn ah-btn-ghost"
              onClick={() => {
                saveGame(clearOrder(s, p.id));
                onClose();
              }}
            >
              Cancel order
            </button>
          ) : (
            <button type="button" className="ah-btn ah-btn-ghost" onClick={onClose}>
              Back
            </button>
          )}
          <button type="button" className="ah-btn" disabled={!verb || !object} onClick={give}>
            Give order
          </button>
        </div>
      </div>
    </div>
  );
}

function Buildings({ s }: { s: HoldState }) {
  return (
    <div className="ah-builds">
      {(Object.keys(BUILDINGS) as BuildingId[]).map((id) => {
        const def = BUILDINGS[id];
        const b = s.buildings[id];
        return (
          <div key={id} className={cn('ah-build ah-frame', b.done && 'done')}>
            <b>
              <Tap text={def.name} />
            </b>
            <small>
              <Tap text={def.gives} />
            </small>
            <Tap
              text={
                b.done
                  ? 'built'
                  : b.started
                    ? `work ${Math.floor(b.progress)} / ${def.work}`
                    : `${def.wood} wood${def.iron ? ` · ${def.iron} iron` : ''}`
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function Report({ s, onClose }: { s: HoldState; onClose: () => void }) {
  return (
    <div className="ah-sheet-back ah-report-back">
      <div className="ah-report" role="dialog" aria-label="Morning report">
        <p className="ah-report-head">
          <Tap text={s.day === 1 ? 'THE FIRST DAY' : `MORNING · DAY ${ROMAN(Math.min(s.day, DAYS))}`} />
        </p>
        <ul>
          {s.report.map((l, i) => (
            <li key={i} style={{ animationDelay: `${i * 90}ms` }}>
              <Tap text={l} />
            </li>
          ))}
        </ul>
        <button type="button" className="ah-btn" onClick={onClose}>
          {s.outcome ? 'See the end' : 'Begin the day'}
        </button>
      </div>
    </div>
  );
}

function End({ s }: { s: HoldState }) {
  const alive = present(s);
  return (
    <section className="ah-title">
      <p className="ah-kicker">
        <Tap text={s.outcome === 'win' ? 'spring has come' : 'the winter won'} />
      </p>
      <h1>
        <Tap text={s.outcome === 'win' ? 'You Survived' : 'The Hold Has Fallen'} />
      </h1>
      <p className="ah-lede">
        <Tap
          text={
            s.outcome === 'win'
              ? `${alive.map((p) => p.name).join(', ')} lived to see the caravan.`
              : `You lasted ${s.day - 1} ${s.day - 1 === 1 ? 'day' : 'days'}.`
          }
        />
      </p>
      <ul className="ah-stats">
        <li>
          <b>{s.stats.phrases}</b>
          <Tap text="orders given" />
        </li>
        <li>
          <b>{s.stats.mistakes}</b>
          <Tap text="orders not understood" />
        </li>
        <li>
          <b>{s.stats.translated ?? 0}</b>
          <Tap text="phrases translated" />
        </li>
        <li>
          <b>
            {s.stats.repelled} / {s.stats.raids}
          </b>
          <Tap text="raids stopped" />
        </li>
      </ul>
      <button type="button" className="ah-btn" onClick={() => saveGame(newGame(Math.floor(Math.random() * 2 ** 31)))}>
        Play again
      </button>
    </section>
  );
}

function Camp({ s }: { s: HoldState }) {
  const [picked, setPicked] = useState<Person['id'] | null>(null);
  // Доклад утра показывается один раз на день: запомнен день, доклад которого уже прочитан.
  const [readDay, setReadDay] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [sure, setSure] = useState(false);
  const person = picked ? s.people.find((p) => p.id === picked && p.status === 'ok' && !p.away) : undefined;
  const idle = present(s).filter((p) => !p.order).length;

  if (s.outcome && ended) return <End s={s} />;
  // Набег этой ночи — бой; до утра лагерь не показывается.
  if (s.battle) return <BattleView s={s} />;
  if (readDay !== s.day || (s.outcome && !ended))
    return (
      <>
        <CampScene s={s} />
        <Report
          s={s}
          onClose={() => {
            setReadDay(s.day);
            if (s.outcome) setEnded(true);
          }}
        />
      </>
    );

  return (
    <>
      <Hud s={s} />
      <CampScene s={s} />
      <Night s={s} />
      <div className="ah-crewlist">
        {s.people.map((p) => (
          <CrewRow key={p.id} p={p} onPick={() => setPicked(p.id)} />
        ))}
      </div>
      <Lands s={s} />
      <Buildings s={s} />
      <div className="ah-endbar">
        <button
          type="button"
          className="ah-btn"
          onClick={() => {
            if (idle > 0 && !sure) return setSure(true);
            setSure(false);
            saveGame(s.tonight ? startBattle(s) : endDay(s));
          }}
        >
          {idle > 0 && sure ? `${idle} without orders will rest — end the day?` : 'End the day'}
        </button>
      </div>
      {person ? <OrderSheet key={person.id} s={s} p={person} onClose={() => setPicked(null)} /> : null}
      {s.reports?.length ? <ScoutReportView key={`${s.day}:${s.reports.length}`} s={s} /> : null}
      {/* Гость ждёт, пока прочитаны доклады разведчиков: два окна разом не открываются. */}
      {!s.reports?.length && s.visitor ? <GateView key={s.day} s={s} /> : null}
    </>
  );
}
