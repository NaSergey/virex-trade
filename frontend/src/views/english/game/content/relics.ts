/**
 * Находки действуют до конца забега; расходники лежат в кармане (до трёх) и
 * тратятся по нажатию. Открытия — за сделанное, выводятся из забегов
 * (`model/meta.ts`), валюты между забегами нет.
 */
export type UnlockId =
  | 'bossBeaten'
  | 'voice20'
  | 'voice30'
  | 'revenge20'
  | 'scenes3'
  | 'scenes5'
  | 'runs10'
  | 'reachedBoss'
  | 'combo12'
  | 'quests15';

export type RelicId =
  | 'umbrella'
  | 'thermos'
  | 'metronome'
  | 'stopwatch'
  | 'pencil'
  | 'headphones'
  | 'pass'
  | 'coin'
  | 'megaphone'
  | 'notebook'
  | 'guide'
  | 'kettle'
  | 'bus'
  | 'newspaper'
  | 'scarf'
  | 'dictionary';

export interface RelicDef {
  name: string;
  text: string;
  /** null — открыта с начала. */
  unlock: UnlockId | null;
  /** Нужно распознавание речи. */
  speech?: true;
}

export const RELICS: Record<RelicId, RelicDef> = {
  umbrella: { name: 'Зонт', text: 'раз в бой прощает ошибку: удар за неё не проходит', unlock: null },
  thermos: { name: 'Термос', text: '+3 здоровья после каждого боя', unlock: null },
  metronome: { name: 'Метроном', text: 'серия растёт вдвое быстрее', unlock: null },
  stopwatch: { name: 'Секундомер', text: 'окно крита на 2 секунды длиннее', unlock: null },
  pencil: { name: 'Карандаш', text: 'в «Вспомнить» видна первая буква', unlock: null },
  headphones: { name: 'Наушники', text: 'верный удар на слух лечит 1', unlock: null },
  pass: { name: 'Проездной', text: 'лавка на 30 % дешевле', unlock: null },
  coin: { name: 'Монетка', text: 'шиллингов на 50 % больше', unlock: null },
  megaphone: { name: 'Мегафон', text: '«Сказать» +3 урона', unlock: 'voice20', speech: true },
  notebook: { name: 'Блокнот', text: 'слово, на котором ошибся, на возврате бьёт ×2', unlock: 'revenge20' },
  guide: { name: 'Путеводитель', text: 'в сцене первая ошибка не тратит терпение', unlock: 'scenes3' },
  kettle: { name: 'Чайник', text: 'скамейка лечит полностью', unlock: 'runs10' },
  bus: { name: 'Двухэтажный автобус', text: 'после боя — выбор из четырёх наград', unlock: 'reachedBoss' },
  newspaper: { name: 'Газета', text: 'первый ответ каждого боя — крит', unlock: 'combo12' },
  scarf: { name: 'Шарф', text: '+6 к макс. здоровью, удары по тебе на 1 слабее', unlock: 'bossBeaten' },
  dictionary: { name: 'Карманный словарь', text: 'раз в бой — подсказка без сброса серии', unlock: 'quests15' },
};

export const RELIC_IDS = Object.keys(RELICS) as RelicId[];

/** Условие открытия словами — в коллекции у закрытого. */
export const UNLOCK_TEXT: Record<UnlockId, string> = {
  bossBeaten: 'победить хранителя',
  voice20: 'сказать голосом 20 слов',
  voice30: 'сказать голосом 30 слов',
  revenge20: 'отбить 20 слов, на которых ошибся',
  scenes3: 'пройти 3 сцены на три звезды',
  scenes5: 'пройти 5 сцен на три звезды',
  runs10: 'сыграть 10 забегов',
  reachedBoss: 'дойти до хранителя',
  combo12: 'серия из 12 верных',
  quests15: 'выполнить 15 заданий дня',
};

export type ItemId = 'tea' | 'hint' | 'brolly' | 'paper' | 'transfer';

export interface ItemDef {
  name: string;
  text: string;
  /** Цена в лавке, шиллингов, от и до. */
  price: [number, number];
}

export const ITEMS: Record<ItemId, ItemDef> = {
  tea: { name: 'Чай', text: '+8 здоровья', price: [9, 12] },
  hint: { name: 'Подсказка', text: 'убрать два неверных варианта или открыть половину букв', price: [9, 12] },
  brolly: { name: 'Складной зонт', text: 'следующий удар противника не проходит', price: [10, 12] },
  paper: { name: 'Свежая газета', text: 'следующий верный ответ — двойной урон', price: [9, 11] },
  transfer: { name: 'Пересадка', text: 'уйти из боя без награды (не у хранителя)', price: [9, 12] },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Карман расходников. */
export const POCKET = 3;
