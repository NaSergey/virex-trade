import { chance, int, pick, shuffle, weighted, type Rand } from '../../game/model/rng';
import type { HoldState, PersonId } from './rules';

/**
 * Разведка (шаг 3, спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md).
 *
 * Вокруг лагеря четыре места — по одному на сторону света. Что в каждом лежит и кто там живёт,
 * разыграно на старте игры и скрыто. Приказ «Ash, scout the north» уводит человека на день;
 * вернувшись, он пишет доклад по-английски, и игра задаёт вопрос по докладу. Ответил верно —
 * место открыто на карте и его можно обыскать («Mira, search the mill»); не понял — место
 * остаётся в тумане. Чтение здесь не украшение: от него зависит, кого и куда посылать.
 */

export type Dir = 'north' | 'east' | 'south' | 'west';
export type PlaceId = 'mill' | 'ruins' | 'farm' | 'cave';
export type Loot = 'food' | 'wood' | 'iron' | 'nothing';
export type Danger = 'none' | 'wolves' | 'bandits';

export const DIRS: readonly Dir[] = ['north', 'east', 'south', 'west'];
export const PLACE_OF: Record<Dir, PlaceId> = { north: 'mill', east: 'ruins', south: 'farm', west: 'cave' };

export const PLACES: Record<PlaceId, { name: string; dir: Dir; intro: [string, string] }> = {
  mill: {
    name: 'the old mill',
    dir: 'north',
    intro: ['I went north. I found an old mill.', 'Я пошёл на север. Я нашёл старую мельницу.'],
  },
  ruins: {
    name: 'the ruins',
    dir: 'east',
    intro: ['I went east. There are old ruins.', 'Я пошёл на восток. Там старые развалины.'],
  },
  farm: { name: 'the farm', dir: 'south', intro: ['I went south. There is an old farm.', 'Я пошёл на юг. Там старая ферма.'] },
  cave: {
    name: 'the cave',
    dir: 'west',
    intro: ['I went west. I found a dark cave.', 'Я пошёл на запад. Я нашёл тёмную пещеру.'],
  },
};

/** Что чаще лежит в месте: на мельнице — зерно, в руинах и пещере — железо, на ферме — еда и доски. */
const LOOT_WEIGHTS: Record<PlaceId, readonly (readonly [Loot, number])[]> = {
  mill: [
    ['food', 5],
    ['wood', 2],
    ['nothing', 1],
  ],
  ruins: [
    ['iron', 4],
    ['wood', 3],
    ['nothing', 1],
  ],
  farm: [
    ['food', 3],
    ['wood', 3],
    ['nothing', 1],
  ],
  cave: [
    ['iron', 5],
    ['nothing', 2],
  ],
};

/** Фразы доклада — короткие, на уровне начала курса; к каждой — перевод для «Translate». */
const LOOT_LINES: Record<Loot, [string, string][]> = {
  food: [
    ['There is food inside.', 'Внутри есть еда.'],
    ['I saw a lot of meat there.', 'Я видел там много мяса.'],
  ],
  wood: [
    ['There is a lot of wood there.', 'Там много дерева.'],
    ['I saw old wood on the floor.', 'Я видел старое дерево на полу.'],
  ],
  iron: [
    ['There is old iron there.', 'Там есть старое железо.'],
    ['I saw iron tools inside.', 'Я видел внутри железные инструменты.'],
  ],
  nothing: [
    ['There is nothing there.', 'Там ничего нет.'],
    ['It is empty. Nothing is inside.', 'Там пусто. Внутри ничего.'],
  ],
};

const DANGER_LINES: Record<Danger, [string, string][]> = {
  none: [
    ['It is quiet. Nobody is there.', 'Там тихо. Там никого нет.'],
    ['I did not see any people there.', 'Я не видел там людей.'],
  ],
  wolves: [
    ['But wolves live there.', 'Но там живут волки.'],
    ['But I heard wolves near it.', 'Но я слышал рядом волков.'],
  ],
  bandits: [
    ['But bandits live there.', 'Но там живут разбойники.'],
    ['But I saw bandits with bows.', 'Но я видел разбойников с луками.'],
  ],
};

/** С 12-го дня доклады длиннее: два предложения связаны союзом, ответ спрятан глубже. */
export const HARD_DAY = 12;

const LOOT_LONG: Record<Loot, [string, string][]> = {
  food: [['I looked inside and saw a lot of meat and other food.', 'Я заглянул внутрь и увидел много мяса и другой еды.']],
  wood: [['There is old wood in every room, enough for a new wall.', 'В каждой комнате старое дерево — хватит на новую стену.']],
  iron: [['Under the floor I found old iron tools.', 'Под полом я нашёл старые железные инструменты.']],
  nothing: [
    [
      'I looked in every room, but somebody took everything before us.',
      'Я заглянул в каждую комнату, но кто-то забрал всё до нас.',
    ],
  ],
};
const DANGER_LONG: Record<Danger, [string, string][]> = {
  none: [['I stayed there all night, and nobody came.', 'Я пробыл там всю ночь, и никто не пришёл.']],
  wolves: [['At night I heard wolves near it, so I did not stay.', 'Ночью я слышал рядом волков, поэтому не остался.']],
  bandits: [['I saw bandits with bows near the door, so I ran away.', 'Я видел у двери разбойников с луками и убежал.']],
};

export const LOOT_ANSWER: Record<Loot, string> = { food: 'Food', wood: 'Wood', iron: 'Iron', nothing: 'Nothing' };
export const DANGER_ANSWER: Record<Danger, string> = {
  none: 'Yes, it is safe.',
  wolves: 'No, wolves live there.',
  bandits: 'No, bandits are there.',
};

export interface Place {
  loot: Loot;
  amount: number;
  danger: Danger;
  known: boolean;
  looted: boolean;
}

export type Places = Record<PlaceId, Place>;

export interface ScoutReport {
  person: PersonId;
  place: PlaceId;
  lines: string[];
  /** Перевод строк — показывается по «Translate» за цену. */
  ru: string[];
  question: string;
  options: string[];
  answer: number;
}

export function makePlaces(r: Rand): Places {
  const make = (id: PlaceId): Place => {
    const loot = weighted(r, LOOT_WEIGHTS[id]);
    return {
      loot,
      amount: loot === 'iron' ? int(r, 4, 6) : loot === 'nothing' ? 0 : int(r, 8, 12),
      danger: chance(r, 0.4) ? pick(r, ['wolves', 'bandits'] as const) : 'none',
      known: false,
      looted: false,
    };
  };
  return { mill: make('mill'), ruins: make('ruins'), farm: make('farm'), cave: make('cave') };
}

/** Доклад вернувшегося разведчика и вопрос по нему — то о добыче, то об опасности. */
export function makeReport(r: Rand, who: PersonId, id: PlaceId, p: Place, day = 1): ScoutReport {
  const hard = day >= HARD_DAY;
  const pairs = [
    PLACES[id].intro,
    pick(r, (hard ? LOOT_LONG : LOOT_LINES)[p.loot]),
    pick(r, (hard ? DANGER_LONG : DANGER_LINES)[p.danger]),
  ];
  const lines = pairs.map((x) => x[0]);
  const ru = pairs.map((x) => x[1]);
  if (chance(r, 0.5)) {
    const wrong = shuffle(
      r,
      (['food', 'wood', 'iron', 'nothing'] as const).filter((x) => x !== p.loot),
    ).slice(0, 2);
    const options = shuffle(r, [p.loot, ...wrong]);
    return {
      person: who,
      place: id,
      lines,
      ru,
      question: `What can we find in ${PLACES[id].name}?`,
      options: options.map((x) => LOOT_ANSWER[x]),
      answer: options.indexOf(p.loot),
    };
  }
  const options = shuffle(r, ['none', 'wolves', 'bandits'] as const);
  return {
    person: who,
    place: id,
    lines,
    ru,
    question: `Is ${PLACES[id].name} safe?`,
    options: options.map((x) => DANGER_ANSWER[x]),
    answer: options.indexOf(p.danger),
  };
}

export type AnswerResult = { ok: boolean; state: HoldState };

/** Ответ на вопрос по первому докладу: верно — место открыто на карте; неверно — остаётся в тумане. */
export function answerReport(s: HoldState, choice: number): AnswerResult {
  const rep = s.reports?.[0];
  if (!rep || !s.places) return { ok: false, state: s };
  const ok = choice === rep.answer;
  return {
    ok,
    state: {
      ...s,
      reports: s.reports!.slice(1),
      places: ok ? { ...s.places, [rep.place]: { ...s.places[rep.place], known: true } } : s.places,
      stats: ok ? { ...s.stats, phrases: s.stats.phrases + 1 } : { ...s.stats, mistakes: s.stats.mistakes + 1 },
    },
  };
}
