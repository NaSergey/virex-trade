'use client';

import { useState, type KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/utils/css';
import { ICONS, type IconId } from '../icons';
import { faceOf, spendMorale, type HoldState, type Obj, type Order } from '../model/rules';
import { PLACES, answerReport, dirOf, placesOf, type Danger, type Dir, type Loot } from '../model/scout';
import { saveGame } from '../model/store';
import { Tap } from './Words';

/**
 * Карта окрестностей и доклад разведчика (шаг 3). Карта — те же фильтры местности, что у
 * лагеря (`#ah-terrain`, `#ah-moss` из `HoldDefs`): лагерь в центре, по сторонам света — четыре
 * места. Не разведанное — туман и «?», понятое — значок места и что в нём (добыча, опасность),
 * обысканное — тусклое. Разведчик в пути стоит на дороге к своему месту.
 */

const W = 390;
const H = 230;
const CAMP = { x: 195, y: 118 };
const AT: Record<Dir, { x: number; y: number }> = {
  north: { x: 195, y: 34 },
  east: { x: 336, y: 118 },
  south: { x: 195, y: 200 },
  west: { x: 54, y: 118 },
};
const LOOT_ICON: Record<Loot, IconId | null> = { food: 'food', wood: 'wood', iron: 'iron', water: 'water', nothing: null };
const DANGER_ICON: Record<Danger, IconId | null> = { none: null, wolves: 'wolf', bandits: 'bandit' };

function Ico({
  id,
  x,
  y,
  s,
  fill,
  className,
}: {
  id: IconId;
  x: number;
  y: number;
  s: number;
  fill: string;
  className?: string;
}) {
  return (
    <svg x={x - s / 2} y={y - s / 2} width={s} height={s} viewBox="0 0 512 512" className={className}>
      <path d={ICONS[id]} fill={fill} />
    </svg>
  );
}

const label = (x: number, y: number, text: string, cls: string) => (
  <text x={x} y={y} textAnchor="middle" className={cls}>
    {text}
  </text>
);

/** Нажатие по месту на карте — приказ без человека: туман — разведать сторону, открытое — обыскать. */
export function Lands({ s, onPick }: { s: HoldState; onPick: (o: Order) => void }) {
  const places = s.places;
  if (!places) return null;
  const away = s.people.filter((p) => p.status === 'ok' && p.away);
  const goingTo = new Set(away.map((p) => p.away!.place));
  const press = (o: Order) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onPick(o),
    onKeyDown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && onPick(o),
  });
  const list = placesOf(places);
  const fog = list.some((x) => !x.p.known && !goingTo.has(x.id));
  const open = list.some((x) => x.p.known && !x.p.looted);
  return (
    <section className="ah-lands">
      <p className="ah-lands-title">
        <Tap text="The lands around the camp" />
      </p>
      <svg className="ah-scene ah-lands-map" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-label="Map">
        <rect width={W} height={H} fill="#2e2518" />
        <rect width={W} height={H} filter="url(#ah-terrain)" opacity=".9" />
        <rect width={W} height={H} fill="#140e09" opacity=".35" />
        <rect width={W} height={H} filter="url(#ah-moss)" opacity=".7" />
        {list.map((x) => (
          <line key={x.id} x1={CAMP.x} y1={CAMP.y} x2={AT[x.dir].x} y2={AT[x.dir].y} className="ah-road" />
        ))}
        <circle cx={CAMP.x} cy={CAMP.y} r="60" fill="url(#ah-light)" />
        <circle cx={CAMP.x} cy={CAMP.y} r="17" className="ah-node ah-node-camp" />
        <Ico id="tent" x={CAMP.x} y={CAMP.y} s={22} fill="url(#ah-bone)" />
        {list.map(({ id, p, dir: side }) => {
          const at = AT[side];
          const dir = side.toUpperCase();
          const up = side === 'south';
          if (!p.known)
            return (
              <g
                key={id}
                className={cn('ah-fogged', !goingTo.has(id) && 'ah-press')}
                {...(goingTo.has(id) ? {} : press({ verb: 'scout', object: `the ${side}` as Obj }))}
              >
                <circle cx={at.x} cy={at.y} r="24" className="ah-fog" />
                {label(at.x, at.y + 6, '?', 'ah-q')}
                {label(at.x, at.y + (up ? -30 : 38), dir, 'ah-dir')}
              </g>
            );
          const loot = LOOT_ICON[p.loot];
          const danger = DANGER_ICON[p.danger];
          return (
            <g
              key={id}
              className={cn(p.looted ? 'ah-looted' : 'ah-press')}
              {...(p.looted ? {} : press({ verb: 'search', object: `the ${id}` as Obj }))}
            >
              <circle cx={at.x} cy={at.y} r="19" className={cn('ah-node', danger && 'ah-node-danger')} />
              <Ico id={id as IconId} x={at.x} y={at.y} s={26} fill="url(#ah-bone)" />
              {label(at.x, at.y + (up ? -27 : 34), PLACES[id].name.toUpperCase(), 'ah-dir ah-known')}
              {p.looted ? (
                label(at.x, at.y + (up ? -40 : 46), 'searched', 'ah-dir')
              ) : (
                <g>
                  {loot ? <Ico id={loot} x={at.x + 22} y={at.y - 14} s={16} fill="url(#ah-bone)" /> : null}
                  {danger ? <Ico id={danger} x={at.x - 22} y={at.y - 14} s={16} fill="#c42a1e" /> : null}
                </g>
              )}
            </g>
          );
        })}
        {away.map((p) => {
          const to = AT[dirOf(places, p.away!.place)];
          // Ближе к лагерю, чем к месту: у места стоит подпись стороны света.
          const x = CAMP.x + (to.x - CAMP.x) * 0.38;
          const y = CAMP.y + (to.y - CAMP.y) * 0.38;
          return (
            <g key={p.id}>
              <circle cx={x} cy={y} r="11" className="ah-node ah-node-scout" />
              <Ico id={faceOf(p)} x={x} y={y} s={16} fill="url(#ah-bone)" />
            </g>
          );
        })}
        <rect width={W} height={H} fill="url(#ah-vig)" pointerEvents="none" />
      </svg>
      <p className="ah-lands-hint">
        <Tap
          text={
            fog
              ? 'Tap a place in the fog to send a scout there.'
              : open
                ? 'Tap a place to search it.'
                : 'There is nothing more to find here.'
          }
        />
      </p>
    </section>
  );
}

/** Доклад разведчика: три фразы и вопрос; ответ открывает место или оставляет его в тумане. */
export function ScoutReportView({ s }: { s: HoldState }) {
  const rep = s.reports![0];
  const who = s.people.find((p) => p.id === rep.person)!;
  const [picked, setPicked] = useState<number | null>(null);
  const [ru, setRu] = useState(false);
  const done = picked !== null;
  const ok = picked === rep.answer;
  return (
    <div className="ah-sheet-back ah-report-back">
      <div className="ah-report" role="dialog" aria-label={`${who.name}'s report`}>
        <p className="ah-report-head">
          <Tap text={`${who.name.toUpperCase()}’S REPORT · ${dirOf(s.places, rep.place).toUpperCase()}`} />
        </p>
        <ul>
          {rep.lines.map((l, i) => (
            <li key={i} style={{ animationDelay: `${i * 90}ms` }}>
              “<Tap text={l} />”{ru && rep.ru ? <span className="ah-ru">{rep.ru[i]}</span> : null}
            </li>
          ))}
        </ul>
        {!done && !ru && rep.ru ? (
          <button
            type="button"
            className="ah-translate ah-translate-paper"
            onClick={() => {
              saveGame(spendMorale(s));
              setRu(true);
            }}
          >
            Translate · −1 morale
          </button>
        ) : null}
        <p className="ah-q-ask">
          <Tap text={rep.question} />
        </p>
        <div className="ah-answers">
          {rep.options.map((o, i) => (
            <button
              key={i}
              type="button"
              className={cn('ah-answer', done && i === rep.answer && 'right', done && i === picked && !ok && 'wrong')}
              disabled={done}
              onClick={() => setPicked(i)}
            >
              {o}
            </button>
          ))}
        </div>
        {done ? (
          <>
            <p className={cn('ah-q-result', ok ? 'pos' : 'neg')}>
              <Tap
                text={
                  ok
                    ? `Now ${PLACES[rep.place].name} is on your map. You can search it.`
                    : `You did not understand ${who.name}. ${PLACES[rep.place].name[0].toUpperCase()}${PLACES[rep.place].name.slice(1)} stays in the fog.`
                }
              />
            </p>
            <button type="button" className="ah-btn" onClick={() => saveGame(answerReport(s, picked).state)}>
              Continue
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
