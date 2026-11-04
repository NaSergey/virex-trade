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
  type PersonId,
} from './rules';
import { makePlaces, makeReport } from './scout';
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
  for (const p of ['Mira', 'Tom', 'Ash', 'Ezra']) {
    add(`ORDER FOR ${p.toUpperCase()}`, `${p}! Quick — how do you survive?`, `${p.toUpperCase()}’S REPORT · NORTH`);
    add(`You did not understand ${p}. The mill stays in the fog.`);
  }
  for (const d of ['north', 'east', 'south', 'west']) add(`scouting the ${d} · back tomorrow`, d.toUpperCase());
  for (const [role, perk] of Object.entries(ROLE_PERK)) add(`${role} · ${perk}`);
  for (const o of OBJECTS)
    for (const v of VERBS)
      for (const r of ['nonsense', 'unknown', 'empty'] as const) add(wrongOrder('Mira', { verb: v, object: o }, r).text);
  for (const n of ['the old mill', 'the ruins', 'the farm', 'the cave']) add(`Now ${n} is on your map. You can search it.`);
  for (let seed = 1; seed <= 40; seed++) {
    let s: HoldState = newGame(seed);
    add(...s.report);
    for (let d = 0; d < 30 && !s.outcome; d++) {
      const plan: [PersonId, Order][] = [
        ['mira', d % 5 === 3 ? { verb: 'search', object: 'the mill' } : { verb: 'go', object: 'hunting' }],
        [
          'ash',
          d % 4 === 0
            ? {
                verb: 'scout',
                object: (['the north', 'the east', 'the south', 'the west'] as const)[d % 4 === 0 ? (d / 4) % 4 : 0],
              }
            : { verb: 'fetch', object: 'water' },
        ],
        ['tom', d % 3 === 0 ? { verb: 'build', object: 'the wall' } : { verb: 'guard', object: 'the gate' }],
        ['ezra', d % 2 ? { verb: 'chop', object: 'wood' } : { verb: 'mine', object: 'iron' }],
      ];
      for (const [id, o] of plan) s = giveOrder(s, id, o).state;
      if (s.visitor) {
        add(s.visitor.speech, s.visitor.detail, ...s.visitor.options.map((o) => o.text));
        for (const o of s.visitor.options) add(...answerVisitor(s, o.id).lines);
        s = answerVisitor(s, s.visitor.options[seed % s.visitor.options.length].id).state;
      }
      if (s.tonight) {
        s = startBattle(s);
        for (let round = 0; round < 6 && s.battle && s.battle.phase !== 'over'; round++) {
          const b = s.battle;
          for (const e of b.enemies) add(intentOf(s, e), e.name);
          const foe = b.enemies.find((e) => e.hp > 0);
          for (const p of present(s)) {
            const label = (seed + round) % 3 === 0 && foe ? foe.name : seed % 2 ? 'Mira' : (foe?.name ?? 'Mira');
            s = battleOrder(s, p.id, p.id === 'ezra' ? 'heal' : p.id === 'tom' ? 'cover' : 'attack', label).state;
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
  for (let i = 0; i < 300; i++) {
    const places = makePlaces(r);
    for (const id of ['mill', 'ruins', 'farm', 'cave'] as const) {
      const rep = makeReport(r, 'ash', id, places[id]);
      add(...rep.lines, rep.question, ...rep.options);
      const late = makeReport(r, 'ash', id, places[id], 20);
      add(...late.lines);
    }
    const v = rollVisitor(r, { ...newGame(i), day: 5 });
    if (v) add(v.speech, v.detail, ...v.options.map((o) => o.text));
  }
  return [...out];
}
