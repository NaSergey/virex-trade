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

export const PLACES: Record<PlaceId, { name: string; dir: Dir; intro: string }> = {
  mill: { name: 'the old mill', dir: 'north', intro: 'I went north and found the old mill.' },
  ruins: { name: 'the ruins', dir: 'east', intro: 'In the east there are old stone ruins.' },
  farm: { name: 'the farm', dir: 'south', intro: 'To the south there is an empty farm.' },
  cave: { name: 'the cave', dir: 'west', intro: 'In the west I found a dark cave.' },
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

const LOOT_LINES: Record<Loot, string[]> = {
  food: ['There are sacks of grain inside.', 'I saw dried meat hanging from the roof.'],
  wood: ['There are piles of dry planks.', 'Many old beams lie on the ground.'],
  iron: ['I found old tools and nails.', 'There is a heap of rusty iron.'],
  nothing: ['There is nothing useful there.', 'Someone took everything before us.'],
};

const DANGER_LINES: Record<Danger, string[]> = {
  none: ['It is quiet. I did not see anyone.', 'No one lives there now.'],
  wolves: ['But wolves sleep there at night.', 'But I heard wolves near it.'],
  bandits: ['But bandits have a camp there.', 'But I saw bandits with bows there.'],
};

export const LOOT_ANSWER: Record<Loot, string> = { food: 'Food', wood: 'Wood', iron: 'Iron', nothing: 'Nothing useful' };
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
export function makeReport(r: Rand, who: PersonId, id: PlaceId, p: Place): ScoutReport {
  const lines = [PLACES[id].intro, pick(r, LOOT_LINES[p.loot]), pick(r, DANGER_LINES[p.danger])];
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
