import { WORDS } from '../../content';
import { VOCAB } from '../../content/vocab';

/**
 * Перевод слова по нажатию. Источник — словарь учебника (слова книги и общий словарь),
 * формы сводятся к словарной простыми правилами (wolves → wolf, killed → kill), а то, что
 * правилами не сводится, и слова самой игры — в `EXTRA`. Тест `gloss.test.ts` прогоняет
 * все тексты игры и требует, чтобы каждое слово находилось.
 */

export interface Gloss {
  /** Словарная форма — её и кладём в карточки. */
  en: string;
  ru: string;
}

/** Неправильные формы, имена и слова игры, которых нет в словаре учебника. */
const EXTRA: Record<string, Gloss> = {
  mira: { en: 'Mira', ru: 'Мира (имя)' },
  tom: { en: 'Tom', ru: 'Том (имя)' },
  ash: { en: 'Ash', ru: 'Эш (имя)' },
  ezra: { en: 'Ezra', ru: 'Эзра (имя)' },
  bit: { en: 'bite', ru: 'укусил (bite)' },
  shot: { en: 'shoot', ru: 'выстрелил (shoot)' },
  took: { en: 'take', ru: 'взял, забрал (take)' },
  ate: { en: 'eat', ru: 'съел (eat)' },
  ran: { en: 'run', ru: 'бежал (run)' },
  came: { en: 'come', ru: 'пришёл (come)' },
  went: { en: 'go', ru: 'пошёл (go)' },
  found: { en: 'find', ru: 'нашёл (find)' },
  saw: { en: 'see', ru: 'увидел (see)' },
  got: { en: 'get', ru: 'получил (get)' },
  gave: { en: 'give', ru: 'отдал (give)' },
  drove: { en: 'drive', ru: 'прогнал (drive away)' },
  lost: { en: 'lose', ru: 'потерял (lose)' },
  left: { en: 'leave', ru: 'ушёл (leave)' },
  heard: { en: 'hear', ru: 'услышал (hear)' },
  stole: { en: 'steal', ru: 'украл (steal)' },
  struck: { en: 'strike', ru: 'ударил (strike)' },
  brought: { en: 'bring', ru: 'принёс (bring)' },
  fought: { en: 'fight', ru: 'дрался (fight)' },
  told: { en: 'tell', ru: 'рассказал (tell)' },
  was: { en: 'be', ru: 'был, была (be)' },
  were: { en: 'be', ru: 'были (be)' },
  is: { en: 'be', ru: 'есть, является (be)' },
  are: { en: 'be', ru: 'есть, являются (be)' },
  am: { en: 'be', ru: 'я есть (be)' },
  has: { en: 'have', ru: 'имеет (have)' },
  had: { en: 'have', ru: 'имел (have)' },
  did: { en: 'do', ru: 'сделал (do)' },
  does: { en: 'do', ru: 'делает (do)' },
  children: { en: 'child', ru: 'дети (child)' },
  men: { en: 'man', ru: 'люди, мужчины (man)' },
  people: { en: 'people', ru: 'люди' },
  wolves: { en: 'wolf', ru: 'волки (wolf)' },
  knives: { en: 'knife', ru: 'ножи (knife)' },
  i: { en: 'I', ru: 'я' },
  me: { en: 'me', ru: 'меня, мне' },
  us: { en: 'us', ru: 'нас, нам' },
  him: { en: 'him', ru: 'его, ему' },
  them: { en: 'them', ru: 'их, им' },
  its: { en: 'its', ru: 'его, её (о предмете)' },
  own: { en: 'own', ru: 'собственный' },
  "don't": { en: 'do not', ru: 'не (делать)' },
  'do not': { en: 'do not', ru: 'не (делать)' },
  bandit: { en: 'bandit', ru: 'разбойник' },
  bandits: { en: 'bandit', ru: 'разбойники (bandit)' },
  brute: { en: 'brute', ru: 'громила' },
  archer: { en: 'archer', ru: 'лучник' },
  thief: { en: 'thief', ru: 'вор' },
  healer: { en: 'healer', ru: 'лекарь' },
  hunter: { en: 'hunter', ru: 'охотник' },
  builder: { en: 'builder', ru: 'строитель' },
  scout: { en: 'scout', ru: 'разведчик; разведать' },
  raid: { en: 'raid', ru: 'набег' },
  well: { en: 'well', ru: 'колодец' },
  forge: { en: 'forge', ru: 'кузница' },
  watchtower: { en: 'watchtower', ru: 'сторожевая башня' },
  mill: { en: 'mill', ru: 'мельница' },
  ruins: { en: 'ruins', ru: 'развалины' },
  cave: { en: 'cave', ru: 'пещера' },
  planks: { en: 'plank', ru: 'доски (plank)' },
  grain: { en: 'grain', ru: 'зерно' },
  sacks: { en: 'sack', ru: 'мешки (sack)' },
  nails: { en: 'nail', ru: 'гвозди (nail)' },
  rusty: { en: 'rusty', ru: 'ржавый' },
  spits: { en: 'spit', ru: 'плюёт (spit)' },
  limps: { en: 'limp', ru: 'хромает (limp)' },
  smash: { en: 'smash', ru: 'разбить, ударить с размаху' },
  smashed: { en: 'smash', ru: 'ударил с размаху (smash)' },
  smashes: { en: 'smash', ru: 'бьёт с размаху (smash)' },
  slash: { en: 'slash', ru: 'рубануть' },
  slashed: { en: 'slash', ru: 'рубанул (slash)' },
  slashes: { en: 'slash', ru: 'рубит (slash)' },
  duck: { en: 'duck', ru: 'пригнуться' },
  ducked: { en: 'duck', ru: 'пригнулся (duck)' },
  dodge: { en: 'dodge', ru: 'увернуться' },
  dodged: { en: 'dodge', ru: 'увернулся (dodge)' },
  parry: { en: 'parry', ru: 'отбить удар' },
  parried: { en: 'parry', ru: 'отбил удар (parry)' },
  kicked: { en: 'kick', ru: 'пнул (kick)' },
  thirty: { en: 'thirty', ru: 'тридцать' },
  blade: { en: 'blade', ru: 'клинок' },
  bows: { en: 'bow', ru: 'луки (bow)' },
  built: { en: 'build', ru: 'построен (build)' },
  cart: { en: 'cart', ru: 'телега' },
  chop: { en: 'chop', ru: 'рубить' },
  chopped: { en: 'chop', ru: 'нарубил (chop)' },
  fetch: { en: 'fetch', ru: 'принести, сходить за' },
  fetched: { en: 'fetch', ru: 'принёс (fetch)' },
  heal: { en: 'heal', ru: 'лечить' },
  healed: { en: 'heal', ru: 'вылечил (heal)' },
  healing: { en: 'heal', ru: 'лечение (heal)' },
  heals: { en: 'heal', ru: 'лечит (heal)' },
  our: { en: 'our', ru: 'наш' },
  raiders: { en: 'raider', ru: 'налётчики (raider)' },
  sat: { en: 'sit', ru: 'сидел (sit)' },
  shield: { en: 'shield', ru: 'щит' },
  ok: { en: 'OK', ru: 'хорошо' },
  missed: { en: 'miss', ru: 'промахнулся (miss)' },
  miss: { en: 'miss', ru: 'промахнуться' },
  mine: { en: 'mine', ru: 'добывать (в шахте); шахта; мой' },
  caravan: { en: 'caravan', ru: 'караван' },
  blocked: { en: 'block', ru: 'отбил, заблокировал (block)' },
};

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, '')
    .trim();

let dict: Map<string, string> | null = null;
function dictionary(): Map<string, string> {
  if (dict) return dict;
  dict = new Map();
  for (const w of [...WORDS, ...VOCAB]) {
    const k = clean(w.en);
    if (k && !dict.has(k)) dict.set(k, w.ru);
  }
  return dict;
}

/** Кандидаты словарной формы: как есть, без -s/-es/-ies, без -ed/-d/-ied, без -ing, без удвоения. */
function stems(w: string): string[] {
  const out = [w];
  const add = (x: string) => x.length > 1 && out.push(x);
  if (w.endsWith('ies')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(`${w.slice(0, -3)}y`);
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
  }
  if (w.endsWith('ing')) {
    add(w.slice(0, -3));
    add(`${w.slice(0, -3)}e`);
    if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
  }
  if (w.endsWith('er')) add(w.slice(0, -2));
  if (w.endsWith('est')) add(w.slice(0, -3));
  if (w.endsWith('ly')) add(w.slice(0, -2));
  return out;
}

/** Перевод слова из текста; `null` — не нашлось (держит тест). */
export function glossOf(token: string): Gloss | null {
  const w = token.toLowerCase().replace(/[’]/g, "'").replace(/'s$/, '');
  if (EXTRA[w]) return EXTRA[w];
  const d = dictionary();
  for (const s of stems(w)) {
    if (EXTRA[s]) return EXTRA[s];
    const ru = d.get(s);
    if (ru) return { en: s, ru: s === w ? ru : `${ru} (${s})` };
  }
  return null;
}

/** Текст → куски: слова (их можно нажать) и всё между ними. */
export function tokens(text: string): { word: boolean; text: string }[] {
  return text
    .split(/([A-Za-z][A-Za-z’']*)/)
    .filter(Boolean)
    .map((t) => ({ word: /^[A-Za-z]/.test(t), text: t }));
}
