import { chance, int, pick, shuffle, type Rand } from '../../game/model/rng';
import { MAX_HP, MAX_MORALE, present, type HoldState, type Person } from './rules';
import { word } from './visitors';
import { addItem, findItem } from './items';

/**
 * События дня — трудные решения. Утром в лагере что-то случается: у ворот замёрзшая девочка,
 * солдаты требуют еды, кто-то нашёл в снегу раненого. Текст — по-английски, ответ — фраза из
 * двух-трёх. Решения стоят ресурсов или настроения, и люди помнят их по-разному: добрый страдает,
 * когда не помогли, жадный — когда отдали своё. Правильного ответа нет — есть цена.
 */

export type EventId =
  | 'girl'
  | 'storm'
  | 'fever'
  | 'water'
  | 'soldiers'
  | 'stranger'
  | 'house'
  | 'body'
  | 'neighbors'
  | 'river'
  | 'song'
  | 'theft';

/** Заголовок окна события — по-английски. */
export const EVENT_TITLE: Record<EventId, string> = {
  girl: 'A child at the gate',
  storm: 'The storm',
  fever: 'Fever',
  water: 'Bad water',
  soldiers: 'Soldiers',
  stranger: 'A man in the snow',
  house: 'The old house',
  body: 'On the road',
  neighbors: 'Neighbors',
  river: 'The frozen river',
  song: 'An old song',
  theft: 'Missing food',
};

export interface GameEvent {
  id: EventId;
  text: string;
  ru: string;
  options: { id: string; text: string }[];
  /** Люди события: первый — о ком речь, второй — свидетель (у кражи). */
  who?: string[];
}

const clampM = (n: number) => Math.max(0, Math.min(MAX_MORALE, n));
const he = (p: Person) => (p.he === false ? 'she' : 'he');
const him = (p: Person) => (p.he === false ? 'her' : 'him');
const He = (p: Person) => (p.he === false ? 'She' : 'He');

/** Утреннее событие: со второго дня, если у ворот нет гостя; недавних по возможности не повторяет. */
export function rollEvent(r: Rand, s: HoldState): GameEvent | null {
  if (s.day < 2 || !chance(r, 0.55)) return null;
  const crew = present(s);
  if (!crew.length) return null;
  const seen = new Set(s.seen ?? []);
  const all: EventId[] = [
    'girl',
    'storm',
    'fever',
    'water',
    'soldiers',
    'stranger',
    'house',
    'body',
    'neighbors',
    'river',
    'song',
    'theft',
  ];
  const fresh = all.filter((id) => !seen.has(id) && (id !== 'theft' || crew.length > 1));
  const id = pick(r, fresh.length ? fresh : all.filter((x) => x !== 'theft' || crew.length > 1));
  const [a, b] = shuffle(r, [...crew]);
  return makeEvent(id, a, b);
}

export function makeEvent(id: EventId, a: Person, b?: Person): GameEvent {
  const ev = (text: string, ru: string, options: [string, string][], who?: Person[]): GameEvent => ({
    id,
    text,
    ru,
    options: options.map(([oid, t]) => ({ id: oid, text: t })),
    who: who?.map((p) => p.id),
  });
  switch (id) {
    case 'girl':
      return ev(
        'A little girl stands at the gate. She is alone, cold and hungry.',
        'У ворот стоит маленькая девочка. Она одна, замёрзшая и голодная.',
        [
          ['take', '“Come in. You can live with us.”'],
          ['feed', '“Here is some food. Go to the village.”'],
          ['send', '“We cannot help you. Go away.”'],
        ],
      );
    case 'storm':
      return ev(
        'A strong wind broke a tent in the night. The snow is coming in.',
        'Сильный ветер ночью порвал палатку. Внутрь заметает снег.',
        [
          ['fix', '“Fix it. Use four wood.”'],
          ['leave', '“Leave it. We need the wood.”'],
        ],
      );
    case 'fever':
      return ev(
        `${a.name} is hot and weak. It is a fever.`,
        `У ${a.name} жар и слабость. Это лихорадка.`,
        [
          ['care', `“Give ${him(a)} water. ${He(a)} must rest today.”`],
          ['work', `“We need everyone. ${a.name} must work.”`],
        ],
        [a],
      );
    case 'water':
      return ev('The water looks bad this morning.', 'Вода этим утром плохо пахнет.', [
        ['boil', '“Boil it on the fire. Use three wood.”'],
        ['drink', '“Drink it. We have no time.”'],
      ]);
    case 'soldiers':
      return ev(
        'Three soldiers stand at the gate. They are tired and hungry. “Give us food, or we take it.”',
        'У ворот трое солдат. Они устали и голодны. «Дайте нам еды, или мы возьмём её сами».',
        [
          ['give', '“Here are five food. Go in peace.”'],
          ['no', '“No. We need our food.”'],
        ],
      );
    case 'stranger':
      return ev(
        `${a.name} found a man in the snow. He is hurt, but alive.`,
        `${a.name} нашёл(ла) в снегу человека. Он тяжело ранен, но жив.`,
        [
          ['help', '“Bring him here. We will help him.”'],
          ['leave', '“Leave him. We cannot feed him.”'],
        ],
        [a],
      );
    case 'house':
      return ev(
        `${a.name} saw an old house in the forest. The door is open. Maybe there is food inside.`,
        `${a.name} увидел(а) в лесу старый дом. Дверь открыта. Может, внутри есть еда.`,
        [
          ['go', '“Go in and look.”'],
          ['stay', '“Stay away. It is not safe.”'],
        ],
        [a],
      );
    case 'body':
      return ev('There is a dead man on the road. He has a big bag.', 'На дороге мёртвый человек. У него большая сумка.', [
        ['take', '“Take the bag.”'],
        ['bury', '“Bury him. He was a person too.”'],
      ]);
    case 'neighbors':
      return ev(
        'People from the next valley ask for wood. Their house is very cold, and they have children.',
        'Люди из соседней долины просят дерева. В их доме очень холодно, и у них дети.',
        [
          ['give', '“Take four wood.”'],
          ['no', '“Sorry. We need it too.”'],
        ],
      );
    case 'river':
      return ev(
        `The river is frozen. ${a.name} wants to make a hole in the ice and catch fish.`,
        `Река замёрзла. ${a.name} хочет сделать прорубь и наловить рыбы.`,
        [
          ['try', '“Try it.”'],
          ['no', '“No. It is too dangerous.”'],
        ],
        [a],
      );
    case 'song':
      return ev(
        `In the evening, ${a.name} wants to sing an old song from home.`,
        `Вечером ${a.name} хочет спеть старую песню из дома.`,
        [
          ['sing', '“Yes, sing for us.”'],
          ['quiet', '“Not now. We must sleep.”'],
        ],
        [a],
      );
    case 'theft': {
      const w = b ?? a;
      return ev(
        `In the morning, some food is missing. ${w.name} says: “I saw ${a.name} near the food at night.”`,
        `Утром пропала часть еды. ${w.name} говорит: «Я видел(а) ночью ${a.name} у еды».`,
        [
          ['ask', `“${a.name}, is this true?”`],
          ['punish', `“${a.name} will not eat today.”`],
          ['forget', '“Forget it. We have bigger problems.”'],
        ],
        [a, w],
      );
    }
  }
}

/** Ответ на событие: что случилось — строками доклада; событие закрыто в любом случае. */
export function answerEvent(s0: HoldState, choice: string): { state: HoldState; lines: string[] } {
  const e = s0.event;
  if (!e) return { state: s0, lines: [] };
  const s: HoldState = structuredClone(s0);
  const r = { s: s.rng };
  const lines: string[] = [];
  const crew = present(s);
  const a = crew.find((p) => p.id === e.who?.[0]) ?? crew[0];
  const b = crew.find((p) => p.id === e.who?.[1]);
  const mood = (d: number, extra?: { kind?: number; greedy?: number; gloomy?: number }) => {
    for (const p of crew) {
      const t = p.trait;
      p.morale = clampM(
        p.morale +
          d +
          (t === 'kind' ? (extra?.kind ?? 0) : 0) +
          (t === 'greedy' ? (extra?.greedy ?? 0) : 0) +
          (t === 'gloomy' ? (extra?.gloomy ?? 0) : 0),
      );
    }
  };
  const hurt = (p: Person | undefined, n = 1) => {
    if (!p) return;
    p.hp = Math.max(1, p.hp - n - (p.trait === 'weak' ? 1 : 0));
  };
  const pay = (res: 'food' | 'water' | 'wood' | 'iron', n: number) => {
    const k = Math.min(s.res[res], n);
    s.res[res] -= k;
    return k;
  };

  switch (e.id) {
    case 'girl':
      if (choice === 'take') {
        s.kids = (s.kids ?? 0) + 1;
        mood(1, { kind: 1, greedy: -1 });
        lines.push('The girl sits by the fire. For the first time, she smiles.');
        lines.push('Now one more person eats and drinks in the camp.');
      } else if (choice === 'feed') {
        const k = pay('food', 2);
        mood(0, { kind: k ? 0 : -1 });
        lines.push(
          k
            ? `You gave ${word(k)} food. She takes it and walks away into the snow.`
            : 'You have no food to give. She walks away.',
        );
      } else {
        mood(-1, { kind: -2 });
        lines.push('She walks away into the snow. Nobody talks for a long time.');
      }
      break;
    case 'storm':
      if (choice === 'fix' && s.res.wood >= 4) {
        s.res.wood -= 4;
        lines.push('You fixed the tent. It is warm inside again.');
      } else {
        if (choice === 'fix') lines.push('There is not enough wood. The tent stays broken.');
        const p = pick(r, crew);
        hurt(p);
        mood(-1);
        lines.push(`${p.name} slept in the cold and is sick now.`);
      }
      break;
    case 'fever':
      if (choice === 'care') {
        const k = pay('water', 3);
        if (a) {
          a.hp = Math.min(MAX_HP, a.hp + (k ? 1 : 0));
          a.order = { verb: 'rest', object: 'by the fire' };
        }
        lines.push(
          k
            ? `${a?.name} drinks and sleeps. ${a ? He(a) : 'He'} will rest by the fire today.`
            : 'There is no water. The fever stays.',
        );
      } else {
        hurt(a);
        mood(0, { kind: -1 });
        lines.push(`${a?.name} goes to work, but ${a ? he(a) : 'he'} is very weak.`);
      }
      break;
    case 'water':
      if (choice === 'boil' && s.res.wood >= 3) {
        s.res.wood -= 3;
        lines.push('You boiled the water. Now it is safe to drink.');
      } else if (chance(r, 0.5) && crew.length) {
        const sick = shuffle(r, [...crew]).slice(0, 2);
        for (const p of sick) hurt(p);
        lines.push(`${sick.map((p) => p.name).join(' and ')} drank the bad water. Now they are sick.`);
      } else lines.push('The water was OK. You were lucky.');
      break;
    case 'soldiers':
      if (choice === 'give') {
        const k = pay('food', 5);
        mood(0, { greedy: -1 });
        lines.push(
          k ? `You gave ${word(k)} food. The soldiers take it and leave.` : 'You have no food. The soldiers laugh and leave.',
        );
      } else if (chance(r, 0.5) && crew.length) {
        const k = pay('wood', 4);
        const p = pick(r, crew);
        hurt(p);
        mood(-1);
        lines.push(
          k
            ? `The soldiers are angry. They hit ${p.name} and take ${word(k)} wood.`
            : `The soldiers are angry. They hit ${p.name}.`,
        );
      } else {
        mood(1);
        lines.push('The soldiers look at your people for a long time. Then they leave.');
      }
      break;
    case 'stranger':
      if (choice === 'help') {
        pay('food', 2);
        pay('water', 2);
        if (chance(r, 0.55)) {
          s.res.iron += 4;
          addItem(s, 'medicine');
          mood(1, { kind: 1 });
          lines.push(
            'The man gets better. Before he leaves, he gives you four iron and some medicine. “Thank you. I will remember you.”',
          );
        } else {
          if (a) a.morale = clampM(a.morale - 2);
          lines.push(`The man died in the night. ${a?.name} sits next to him for a long time.`);
        }
      } else {
        if (a) a.morale = clampM(a.morale - 2);
        mood(0, { kind: -2 });
        lines.push(`${a?.name} cannot stop thinking about the man in the snow.`);
      }
      break;
    case 'house':
      if (choice === 'go') {
        if (chance(r, 0.6)) {
          const n = int(r, 4, 6);
          s.res.food += n;
          lines.push(`${a?.name} found ${word(n)} food in the house!`);
          const found = a ? findItem(r, s, a, 0.5) : null;
          if (found) lines.push(found);
        } else {
          hurt(a, 2);
          lines.push(`There was a wolf inside! ${a?.name} is hurt.`);
        }
      } else lines.push(`${a?.name} comes back to the camp.`);
      break;
    case 'body':
      if (choice === 'take') {
        s.res.iron += 3;
        s.res.food += 2;
        mood(0, { kind: -2, gloomy: -1, greedy: 1 });
        addItem(s, 'knife');
        lines.push('In the bag: three iron, two food and a knife. Some of your people do not like this.');
      } else {
        mood(1, { greedy: -1 });
        lines.push('You bury the man. People feel a little better.');
      }
      break;
    case 'neighbors':
      if (choice === 'give') {
        const k = pay('wood', 4);
        mood(k ? 1 : 0, { kind: 1, greedy: -1 });
        lines.push(k ? '“Thank you! We will not forget this.” They take the wood home.' : 'You have no wood. They go home cold.');
        if (k && chance(r, 0.5)) {
          s.res.food += 4;
          lines.push('Later, a boy from the valley brings you four food.');
        }
      } else {
        mood(0, { kind: -2 });
        lines.push('They go home. Their children will be cold tonight.');
      }
      break;
    case 'river':
      if (choice === 'try') {
        if (chance(r, 0.7)) {
          s.res.food += 4;
          lines.push(`${a?.name} caught fish! Four food.`);
        } else {
          hurt(a, 2);
          lines.push(`The ice broke! ${a?.name} fell into the cold water.`);
        }
      } else lines.push(`${a?.name} goes back to work.`);
      break;
    case 'song':
      if (choice === 'sing') {
        mood(1);
        lines.push('Everyone listens. For one night, the winter is not so bad.');
      } else {
        if (a) a.morale = clampM(a.morale - 1);
        lines.push(`${a?.name} is quiet all evening.`);
      }
      break;
    case 'theft': {
      pay('food', 3);
      if (!a) break;
      if (choice === 'ask') {
        if (a.trait === 'greedy') {
          lines.push(`${a.name} looks down. “I was so hungry. I am sorry.” People forgive ${him(a)}.`);
        } else {
          a.morale = clampM(a.morale - 1);
          if (b) b.morale = clampM(b.morale - 1);
          lines.push(`${a.name} is angry: “It was not me!” Now ${a.name} and ${b?.name} do not talk.`);
        }
      } else if (choice === 'punish') {
        a.morale = clampM(a.morale - 3);
        mood(0, { kind: -1 });
        lines.push(`${a.name} does not eat today. ${He(a)} is hungry and angry.`);
      } else {
        mood(0, { greedy: 1 });
        lines.push('You say nothing. But now people watch the food at night.');
      }
      break;
    }
  }
  s.event = null;
  s.seen = [...(s.seen ?? []), e.id].slice(-8);
  s.rng = r.s;
  return { state: s, lines };
}
