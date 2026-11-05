// Тексты игры для проверок словаря и уровня: прогон ботом плюс справочные строки. Только тестам.
import { rand } from '../../game/model/rng';
import { REACTION_HINT, SAVES, battleOrder, fight, finishBattle, intentOf, react, startBattle } from './battle';
import {
  BUILDINGS,
  OBJECTS,
  ROLE_PERK,
  VERBS,
  endDay,
  wrongOrder,
  giveOrder,
  newGame,
  present,
  type HoldState,
  type Order,
  type Role,
} from './rules';
import { CONDS } from './conds';
import { RECRUITS, TRAIT_TEXT, TRAIT_WORD, cheerLine, sadLine } from './crew';
import { EVENT_TITLE, answerEvent, makeEvent, type EventId } from './events';
import { ITEMS, ITEM_IDS, giveGear, spendItem, takeGear, withArticle } from './items';
import { ALL_PLACES, DIRS, PLACES, makePlaces, makeReport, placesOf } from './scout';
import { answerVisitor, rollVisitor } from './visitors';

/** Все тексты, которые игра показывает по-английски: прогон ботом плюс справочные строки. */
export function allTexts(): string[] {
  const out = new Set<string>();
  const add = (...xs: (string | undefined | null)[]) => xs.forEach((x) => x && out.add(x));
  add(...VERBS, ...OBJECTS, ...Object.values(ROLE_PERK), ...Object.values(REACTION_HINT));
  for (const b of Object.values(BUILDINGS)) add(b.gives, b.name);
  // Подписи экранов: шапки, статусы, итоги — их тоже можно нажать.
  add(
    'a survival game in English',
    'Four people. Thirty days of winter. Give them orders in English — and keep them alive until the spring caravan comes.',
    'DAY',
    'of',
    'MORALE',
    'DEFENSE',
    'dead',
    'left the camp',
    'built',
    'work',
    'wood · iron',
    'The watchtower sees wolves coming tonight. Their strength: 3.',
    'The watchtower sees bandits coming tonight. Their strength: 3.',
    'The watchtower sees no one. The night will be quiet.',
    'Night will come. You cannot see who is out there.',
    'THE FIRST DAY',
    'MORNING · DAY',
    'spring has come',
    'the winter won',
    'You Survived',
    'The Hold Has Fallen',
    'Mira, Tom lived to see the caravan.',
    'You lasted 3 days.',
    'You lasted 1 day.',
    'orders given',
    'orders not understood',
    'phrases translated',
    'raids stopped',
    'NIGHT RAID · ROUND',
    'Your answer',
    'THE WOMAN SAYS',
    'THE STRANGER SAYS',
    'The lands around the camp',
  );
  const names = RECRUITS.map((x) => x.name);
  for (const p of names) {
    add(`ORDER FOR ${p.toUpperCase()}`, `${p}! Quick — how do you survive?`);
    for (const d of DIRS) add(`${p.toUpperCase()}’S REPORT · ${d.toUpperCase()}`);
    for (const n of ALL_PLACES)
      add(`You did not understand ${p}. ${PLACES[n].name[0].toUpperCase()}${PLACES[n].name.slice(1)} stays in the fog.`);
  }
  add('Tap a place in the fog to send a scout there.', 'Tap a place to search it.', 'There is nothing more to find here.');
  add('free', 'now:', 'What do you say?', 'one child in the camp', '2 children in the camp');
  add(...Object.values(TRAIT_TEXT), ...Object.values(TRAIT_WORD), ...Object.values(EVENT_TITLE).map((t) => t.toUpperCase()));
  for (const c of Object.values(CONDS)) add(c.name, c.text);
  for (const d of DIRS) add(`Who will scout the ${d}?`, `scouting the ${d} · back tomorrow`, d.toUpperCase());
  for (const n of ALL_PLACES) add(`Who will search the ${n}?`, PLACES[n].name.toUpperCase());
  for (const [role, perk] of Object.entries(ROLE_PERK)) add(`${role} · ${perk}`);
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = newGame(seed);
    for (const o of OBJECTS)
      for (const v of VERBS)
        for (const r of ['nonsense', 'unknown', 'empty', 'absent'] as const)
          add(wrongOrder(g, 'Mira', { verb: v, object: o }, r).text);
  }
  for (const n of ALL_PLACES) add(`Now ${PLACES[n].name} is on your map. You can search it.`);
  // Вещи и постройки.
  add('Things we have', 'Who carries what', 'We have nothing yet. Search places to find things.', 'Build in the camp');
  add('Tap a building to send someone to build it. The builder works twice as fast.', 'Everything is built. The camp is strong.');
  for (const b of Object.values(BUILDINGS)) add(`needs ${b.wood} wood${b.iron ? ` and ${b.iron} iron` : ''}`);
  for (const id of ITEM_IDS) {
    const d = ITEMS[id];
    add(d.name, d.text, `Who needs the ${d.name}?`, `Who gets the ${d.name}?`, `with the ${d.name}`);
    for (const p of names) add(`${p} has the ${d.name}`, `${p} also found ${withArticle(d.name)}.`);
  }
  for (let seed = 1; seed <= 6; seed++) {
    let g = newGame(seed);
    for (const id of ITEM_IDS) g = { ...g, items: { ...g.items, [id]: 2 } };
    for (const p of present(g))
      for (const id of ITEM_IDS) {
        const u = spendItem(g, id, p.id) ?? giveGear(g, id, p.id);
        if (u) add(u.line);
        const worn = giveGear(g, 'axe', p.id);
        if (worn) {
          add(giveGear(worn.state, 'bow', p.id)?.line, takeGear(worn.state, p.id)?.line);
        }
      }
  }
  const rr = rand(9);
  for (let i = 0; i < 200; i++) for (const p of RECRUITS) add(sadLine(rr, p.name, p.he), cheerLine(rr, p.name));
  // События: каждое — с каждым ответом, на разных людях и запасах.
  for (let seed = 1; seed <= 30; seed++) {
    const g = { ...newGame(seed), day: 5 };
    const crew = present(g);
    for (const id of Object.keys(EVENT_TITLE) as EventId[]) {
      const e = makeEvent(id, crew[seed % crew.length], crew[(seed + 1) % crew.length]);
      add(e.text, ...e.options.map((o) => o.text));
      for (const o of e.options)
        for (const res of [g.res, { food: 0, water: 0, wood: 0, iron: 0 }]) {
          for (let k = 0; k < 4; k++) add(...answerEvent({ ...g, res, event: e, rng: seed * 31 + k }, o.id).lines);
        }
    }
  }
  const ROLE_PLAN = (s: HoldState, d: number): Partial<Record<Role, Order>> => {
    const known = placesOf(s.places).find((x) => x.p.known && !x.p.looted)?.id;
    return {
      hunter:
        d % 5 === 3 && known ? { verb: 'search', object: `the ${known}` as Order['object'] } : { verb: 'go', object: 'hunting' },
      scout:
        d % 4 === 0
          ? { verb: 'scout', object: `the ${DIRS[(d / 4) % 4]}` as Order['object'] }
          : { verb: 'fetch', object: 'water' },
      builder: d % 3 === 0 ? { verb: 'build', object: 'the wall' } : { verb: 'guard', object: 'the gate' },
      healer: d % 2 ? { verb: 'chop', object: 'wood' } : { verb: 'mine', object: 'iron' },
    };
  };
  for (let seed = 1; seed <= 60; seed++) {
    let s: HoldState = newGame(seed, { classic: seed <= 10 });
    add(...s.report);
    for (let d = 0; d < 30 && !s.outcome; d++) {
      const plan = ROLE_PLAN(s, d);
      for (const p of present(s)) {
        const o = plan[p.role];
        if (o) s = giveOrder(s, p.id, o).state;
      }
      if (s.visitor) {
        add(s.visitor.speech, s.visitor.detail, ...s.visitor.options.map((o) => o.text));
        for (const o of s.visitor.options) add(...answerVisitor(s, o.id).lines);
        s = answerVisitor(s, s.visitor.options[seed % s.visitor.options.length].id).state;
      }
      if (s.event) {
        add(s.event.text, ...s.event.options.map((o) => o.text));
        for (const o of s.event.options) add(...answerEvent(s, o.id).lines);
        s = answerEvent(s, s.event.options[seed % s.event.options.length].id).state;
      }
      if (s.tonight) {
        s = startBattle(s);
        for (let round = 0; round < 6 && s.battle && s.battle.phase !== 'over'; round++) {
          const b = s.battle;
          for (const e of b.enemies) add(intentOf(s, e), e.name);
          const foe = b.enemies.find((e) => e.hp > 0);
          const first = s.people[0].name;
          for (const p of present(s)) {
            const label = (seed + round) % 3 === 0 && foe ? foe.name : seed % 2 ? first : (foe?.name ?? first);
            s = battleOrder(s, p.id, p.role === 'healer' ? 'heal' : p.role === 'builder' ? 'cover' : 'attack', label).state;
          }
          s = fight(s);
          s.battle?.hits.forEach((h, i) => (s = react(s, i, (seed + i) % 2 ? SAVES[h.verb] : null)));
          add(...(s.battle?.last ?? []));
        }
        s = finishBattle(s);
      }
      s = endDay(s);
      add(...s.report);
      for (const r of s.reports ?? []) add(...r.lines, r.question, ...r.options);
      s = { ...s, reports: [] };
    }
  }
  const r = rand(5);
  for (let i = 0; i < 400; i++) {
    const places = makePlaces(r);
    for (const { id, p } of placesOf(places)) {
      const rep = makeReport(r, 'ash', id, p);
      add(...rep.lines, rep.question, ...rep.options);
      const late = makeReport(r, 'ash', id, p, 20);
      add(...late.lines);
    }
    const v = rollVisitor(r, { ...newGame(i), day: 5 });
    if (v) add(v.speech, v.detail, ...v.options.map((o) => o.text));
  }
  return [...out];
}
