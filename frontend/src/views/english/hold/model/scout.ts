import { chance, int, pick, shuffle, weighted, type Rand } from '../../game/model/rng';
import type { HoldState, PersonId } from './rules';

/**
 * Разведка (шаг 3, спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md).
 *
 * Вокруг лагеря четыре места — по одному на сторону света. Какие это места (из десяти), где они
 * стоят, что в каждом лежит и кто там живёт, разыграно на старте игры и скрыто: карта у каждой
 * партии своя. Приказ «Ash, scout the north» уводит человека на день; вернувшись, он пишет
 * доклад по-английски, и игра задаёт вопрос по докладу. Ответил верно — место открыто на карте и
 * его можно обыскать («Mira, search the mill»); не понял — место остаётся в тумане.
 */

export type Dir = 'north' | 'east' | 'south' | 'west';
export type PlaceId = 'mill' | 'ruins' | 'farm' | 'cave' | 'swamp' | 'church' | 'mine' | 'village' | 'bridge' | 'lake';
export type Loot = 'food' | 'wood' | 'iron' | 'water' | 'nothing';
export type Danger = 'none' | 'wolves' | 'bandits';

export const DIRS: readonly Dir[] = ['north', 'east', 'south', 'west'];
export const ALL_PLACES: readonly PlaceId[] = [
  'mill',
  'ruins',
  'farm',
  'cave',
  'swamp',
  'church',
  'mine',
  'village',
  'bridge',
  'lake',
];
/** Карта старых партий (до случайной карты) и «классической» игры тестов. */
export const CLASSIC_MAP: Record<Dir, PlaceId> = { north: 'mill', east: 'ruins', south: 'farm', west: 'cave' };

export const DIR_RU: Record<Dir, [string, string]> = {
  north: ['север', 'на севере'],
  east: ['восток', 'на востоке'],
  south: ['юг', 'на юге'],
  west: ['запад', 'на западе'],
};

interface PlaceDef {
  name: string;
  /** Что нашёл разведчик — вторая половина первой строки доклада, с переводом. */
  found: [string, string][];
  /** Что чаще лежит в месте. */
  loot: readonly (readonly [Loot, number])[];
  /** Насколько там опасно — доля мест с волками или разбойниками. */
  risk: number;
}

export const PLACES: Record<PlaceId, PlaceDef> = {
  mill: {
    name: 'the old mill',
    found: [
      ['I found an old mill.', 'Я нашёл старую мельницу.'],
      ['There is an old mill by the river.', 'Там у реки старая мельница.'],
    ],
    loot: [
      ['food', 5],
      ['wood', 2],
      ['nothing', 1],
    ],
    risk: 0.35,
  },
  ruins: {
    name: 'the ruins',
    found: [
      ['There are old ruins.', 'Там старые развалины.'],
      ['I found the ruins of a big house.', 'Я нашёл развалины большого дома.'],
    ],
    loot: [
      ['iron', 4],
      ['wood', 3],
      ['nothing', 1],
    ],
    risk: 0.45,
  },
  farm: {
    name: 'the farm',
    found: [
      ['There is an old farm.', 'Там старая ферма.'],
      ['I found a farm. Nobody lives there now.', 'Я нашёл ферму. Сейчас там никто не живёт.'],
    ],
    loot: [
      ['food', 3],
      ['wood', 3],
      ['nothing', 1],
    ],
    risk: 0.35,
  },
  cave: {
    name: 'the cave',
    found: [
      ['I found a dark cave.', 'Я нашёл тёмную пещеру.'],
      ['There is a cave in the hill.', 'В холме есть пещера.'],
    ],
    loot: [
      ['iron', 5],
      ['water', 2],
      ['nothing', 2],
    ],
    risk: 0.5,
  },
  swamp: {
    name: 'the swamp',
    found: [
      ['There is a big swamp.', 'Там большое болото.'],
      ['I found a swamp. There is water everywhere.', 'Я нашёл болото. Везде вода.'],
    ],
    loot: [
      ['water', 4],
      ['food', 2],
      ['nothing', 2],
    ],
    risk: 0.3,
  },
  church: {
    name: 'the church',
    found: [
      ['I found an old church.', 'Я нашёл старую церковь.'],
      ['There is a small church on the hill.', 'Там на холме маленькая церковь.'],
    ],
    loot: [
      ['food', 3],
      ['iron', 2],
      ['nothing', 2],
    ],
    risk: 0.4,
  },
  mine: {
    name: 'the mine',
    found: [
      ['I found an old mine.', 'Я нашёл старую шахту.'],
      ['There is an old mine in the rocks.', 'Там в скалах старая шахта.'],
    ],
    loot: [
      ['iron', 6],
      ['wood', 1],
      ['nothing', 1],
    ],
    risk: 0.5,
  },
  village: {
    name: 'the village',
    found: [
      ['I found a village. The houses are empty.', 'Я нашёл деревню. Дома пустые.'],
      ['There is a small village. Nobody is in the street.', 'Там маленькая деревня. На улице никого.'],
    ],
    loot: [
      ['food', 3],
      ['wood', 3],
      ['iron', 1],
      ['nothing', 1],
    ],
    risk: 0.5,
  },
  bridge: {
    name: 'the bridge',
    found: [
      ['I found a broken bridge.', 'Я нашёл сломанный мост.'],
      ['There is an old bridge over the river.', 'Там старый мост через реку.'],
    ],
    loot: [
      ['wood', 4],
      ['iron', 2],
      ['nothing', 1],
    ],
    risk: 0.4,
  },
  lake: {
    name: 'the lake',
    found: [
      ['I found a lake.', 'Я нашёл озеро.'],
      ['There is a lake in the forest. The water is clean.', 'В лесу озеро. Вода чистая.'],
    ],
    loot: [
      ['water', 5],
      ['food', 2],
      ['nothing', 1],
    ],
    risk: 0.3,
  },
};

/** Фразы доклада — короткие, на уровне начала курса; к каждой — перевод для «Translate». */
const LOOT_LINES: Record<Loot, [string, string][]> = {
  food: [
    ['There is food inside.', 'Внутри есть еда.'],
    ['I saw a lot of meat there.', 'Я видел там много мяса.'],
    ['I saw bags of meat and fish.', 'Я видел мешки с мясом и рыбой.'],
    ['There is something to eat there.', 'Там есть что поесть.'],
    ['I found old food. It is still good.', 'Я нашёл старую еду. Она ещё хорошая.'],
    ['I saw a big box of food in the corner.', 'Я видел в углу большой ящик с едой.'],
  ],
  wood: [
    ['There is a lot of wood there.', 'Там много дерева.'],
    ['I saw old wood on the floor.', 'Я видел старое дерево на полу.'],
    ['There are dry trees and broken doors.', 'Там сухие деревья и сломанные двери.'],
    ['We can take the wood from the walls.', 'Можно забрать дерево со стен.'],
    ['I saw a lot of dry wood in a corner.', 'Я видел в углу много сухого дерева.'],
  ],
  iron: [
    ['There is old iron there.', 'Там есть старое железо.'],
    ['I saw iron tools inside.', 'Я видел внутри железные инструменты.'],
    ['I saw old knives and heavy tools.', 'Я видел старые ножи и тяжёлые инструменты.'],
    ['There is metal on the ground. It is old but strong.', 'На земле металл. Он старый, но крепкий.'],
    ['I found a box of nails and iron parts.', 'Я нашёл ящик гвоздей и железных деталей.'],
  ],
  water: [
    ['There is clean water there.', 'Там есть чистая вода.'],
    ['I saw a lot of water. We can bring it here.', 'Я видел много воды. Её можно принести сюда.'],
    ['There is a lot of water inside.', 'Внутри много воды.'],
    ['The water there is good to drink.', 'Вода там хорошая, её можно пить.'],
  ],
  nothing: [
    ['There is nothing there.', 'Там ничего нет.'],
    ['It is empty. Nothing is inside.', 'Там пусто. Внутри ничего.'],
    ['Somebody was there before us. Everything is gone.', 'Кто-то был там до нас. Всё забрали.'],
    ['I looked for a long time, but I found nothing.', 'Я долго искал, но ничего не нашёл.'],
    ['It is not worth the walk. There is nothing.', 'Туда не стоит идти. Там ничего.'],
  ],
};

const DANGER_LINES: Record<Danger, [string, string][]> = {
  none: [
    ['It is quiet. Nobody is there.', 'Там тихо. Там никого нет.'],
    ['I did not see any people there.', 'Я не видел там людей.'],
    ['I did not hear any animals. It is safe.', 'Я не слышал зверей. Там безопасно.'],
    ['Nobody lives there now.', 'Сейчас там никто не живёт.'],
    ['I walked around it twice. I saw nobody.', 'Я дважды обошёл вокруг. Никого не видел.'],
  ],
  wolves: [
    ['But wolves live there.', 'Но там живут волки.'],
    ['But I heard wolves near it.', 'Но я слышал рядом волков.'],
    ['But I saw a lot of wolf tracks in the snow.', 'Но я видел в снегу много волчьих следов.'],
    ['Be careful. There are wolves in the trees.', 'Осторожно. В деревьях волки.'],
    ['I saw bones and blood. Wolves eat there.', 'Я видел кости и кровь. Там едят волки.'],
  ],
  bandits: [
    ['But bandits live there.', 'Но там живут разбойники.'],
    ['But I saw bandits with bows.', 'Но я видел разбойников с луками.'],
    ['But I saw a fire and men with knives.', 'Но я видел костёр и людей с ножами.'],
    ['Be careful. Bandits sleep there at night.', 'Осторожно. Ночью там спят разбойники.'],
    ['I heard angry men. They are not friends.', 'Я слышал злых людей. Они не друзья.'],
  ],
};

/** С 12-го дня доклады длиннее: два предложения связаны союзом, ответ спрятан глубже. */
export const HARD_DAY = 12;

const LOOT_LONG: Record<Loot, [string, string][]> = {
  food: [
    ['I looked inside and saw a lot of meat and other food.', 'Я заглянул внутрь и увидел много мяса и другой еды.'],
    ['Under the floor there is a small room, and it is full of food.', 'Под полом маленькая комната, и она полна еды.'],
  ],
  wood: [
    ['There is old wood in every room, enough for a new wall.', 'В каждой комнате старое дерево — хватит на новую стену.'],
    ['The roof fell down, so there is a lot of dry wood now.', 'Крыша упала, поэтому теперь там много сухого дерева.'],
  ],
  iron: [
    ['Under the floor I found old iron tools.', 'Под полом я нашёл старые железные инструменты.'],
    ['The doors are made of iron, and we can take them.', 'Двери из железа, и их можно забрать.'],
  ],
  water: [
    ['There is a deep hole with water, and the water is clean.', 'Там глубокая яма с водой, и вода чистая.'],
    ['It is warm under the ground, so there is always water.', 'Под землёй тепло, поэтому вода там есть всегда.'],
  ],
  nothing: [
    [
      'I looked in every room, but somebody took everything before us.',
      'Я заглянул в каждую комнату, но кто-то забрал всё до нас.',
    ],
    ['I wanted to find something useful, but it is all broken.', 'Я хотел найти что-то полезное, но всё сломано.'],
  ],
};
const DANGER_LONG: Record<Danger, [string, string][]> = {
  none: [
    ['I stayed there all night, and nobody came.', 'Я пробыл там всю ночь, и никто не пришёл.'],
    ['I waited until dark, but I did not see anybody.', 'Я ждал до темноты, но никого не увидел.'],
  ],
  wolves: [
    ['At night I heard wolves near it, so I did not stay.', 'Ночью я слышал рядом волков, поэтому не остался.'],
    ['I wanted to sleep there, but the wolves came close.', 'Я хотел там заночевать, но волки подошли близко.'],
  ],
  bandits: [
    ['I saw bandits with bows near the door, so I ran away.', 'Я видел у двери разбойников с луками и убежал.'],
    ['Men with knives came in the evening, and I hid in the snow.', 'Вечером пришли люди с ножами, и я спрятался в снегу.'],
  ],
};

export const LOOT_ANSWER: Record<Loot, string> = { food: 'Food', wood: 'Wood', iron: 'Iron', water: 'Water', nothing: 'Nothing' };
export const DANGER_ANSWER: Record<Danger, string> = {
  none: 'Yes, it is safe.',
  wolves: 'No, wolves live there.',
  bandits: 'No, bandits are there.',
};

export interface Place {
  /** Сторона света — у каждой партии своя. У старых сохранений её нет: подставляет `withPlaces`. */
  dir?: Dir;
  loot: Loot;
  amount: number;
  danger: Danger;
  known: boolean;
  looted: boolean;
}

export type Places = Partial<Record<PlaceId, Place>>;

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

/** Места партии в порядке сторон света — север, восток, юг, запад. */
export function placesOf(places: Places | undefined): { id: PlaceId; p: Place; dir: Dir }[] {
  if (!places) return [];
  return (Object.keys(places) as PlaceId[])
    .map((id) => ({ id, p: places[id]!, dir: places[id]!.dir ?? dirOfClassic(id) }))
    .sort((a, b) => DIRS.indexOf(a.dir) - DIRS.indexOf(b.dir));
}
const dirOfClassic = (id: PlaceId): Dir => (Object.keys(CLASSIC_MAP) as Dir[]).find((d) => CLASSIC_MAP[d] === id) ?? 'north';

/** Какое место стоит на этой стороне света. */
export const placeAt = (places: Places | undefined, dir: Dir): PlaceId | null =>
  placesOf(places).find((x) => x.dir === dir)?.id ?? null;

/** Сторона света места этой партии. */
export const dirOf = (places: Places | undefined, id: PlaceId): Dir => places?.[id]?.dir ?? dirOfClassic(id);

function makePlace(r: Rand, id: PlaceId, dir: Dir): Place {
  const def = PLACES[id];
  const loot = weighted(r, def.loot);
  return {
    dir,
    loot,
    amount: loot === 'iron' ? int(r, 4, 6) : loot === 'nothing' ? 0 : int(r, 8, 12),
    danger: chance(r, def.risk) ? pick(r, ['wolves', 'bandits'] as const) : 'none',
    known: false,
    looted: false,
  };
}

/** Карта партии: четыре места из десяти, каждое на случайной стороне света. `classic` — прежняя карта. */
export function makePlaces(r: Rand, classic = false): Places {
  const map: Record<Dir, PlaceId> = classic
    ? CLASSIC_MAP
    : (() => {
        const ids = shuffle(r, [...ALL_PLACES]).slice(0, 4);
        return { north: ids[0], east: ids[1], south: ids[2], west: ids[3] };
      })();
  const out: Places = {};
  for (const dir of DIRS) out[map[dir]] = makePlace(r, map[dir], dir);
  return out;
}

const LOOTS: readonly Loot[] = ['food', 'wood', 'iron', 'water', 'nothing'];

/** Доклад вернувшегося разведчика и вопрос по нему — то о добыче, то об опасности. */
export function makeReport(r: Rand, who: PersonId, id: PlaceId, p: Place, day = 1): ScoutReport {
  const hard = day >= HARD_DAY;
  const dir = p.dir ?? dirOfClassic(id);
  const found = pick(r, PLACES[id].found);
  const pairs: [string, string][] = [
    [`I went ${dir}. ${found[0]}`, `Я пошёл на ${DIR_RU[dir][0]}. ${found[1]}`],
    pick(r, (hard ? LOOT_LONG : LOOT_LINES)[p.loot]),
    pick(r, (hard ? DANGER_LONG : DANGER_LINES)[p.danger]),
  ];
  const lines = pairs.map((x) => x[0]);
  const ru = pairs.map((x) => x[1]);
  if (chance(r, 0.5)) {
    const wrong = shuffle(
      r,
      LOOTS.filter((x) => x !== p.loot),
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
  if (!rep || !s.places?.[rep.place]) return { ok: false, state: s };
  const ok = choice === rep.answer;
  return {
    ok,
    state: {
      ...s,
      reports: s.reports!.slice(1),
      places: ok ? { ...s.places, [rep.place]: { ...s.places[rep.place]!, known: true } } : s.places,
      stats: ok ? { ...s.stats, phrases: s.stats.phrases + 1 } : { ...s.stats, mistakes: s.stats.mistakes + 1 },
    },
  };
}
