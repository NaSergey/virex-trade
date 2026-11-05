import { chance, int, pick, shuffle, type Rand } from '../../game/model/rng';
import { MAX_MORALE, present, type HoldState, type ResId } from './rules';
import { PLACES, placesOf } from './scout';

/**
 * Гости у ворот (шаг 4, спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md).
 *
 * Утром у ворот может стоять гость. Он говорит по-английски, рассказчик добавляет одну деталь о
 * нём — и решить, что ответить, можно, только прочитав обе строки. Торговец и разбойник под видом
 * торговца говорят одно и то же и получают одни и те же три ответа: отличает их только деталь
 * («There is blood on his boots.» против «His cart is full of bags.»). Голодные беженцы
 * просят еды, раненый путник — воды и платит тем, что знает о местах вокруг лагеря.
 */

export type VisitorKind = 'trader' | 'liar' | 'beggar' | 'traveler';
export type Answer = 'trade' | 'check' | 'refuse' | 'give' | 'deny';

export interface Visitor {
  kind: VisitorKind;
  /** Что он говорит — по-английски, кавычками на экране. */
  speech: string;
  /** Что видно со стены. Для разбойника — улика. */
  detail: string;
  /** Перевод речи и детали — по «Translate» за цену. */
  ru: { speech: string; detail: string };
  options: { id: Answer; text: string }[];
  /** Сделка торговца (и мнимая — у разбойника): он отдаёт `give`, хочет `want`. */
  offer?: { give: ResId; giveN: number; want: ResId; wantN: number };
  /** Чего просит беженец или путник. */
  ask?: { res: ResId; n: number };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const word = (n: number) => WORDS[n] ?? String(n);

const RU_NUM = [
  'ноль',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
  'десять',
  'одиннадцать',
  'двенадцать',
];
const RU_RES: Record<ResId, string> = { food: 'еды', wood: 'дерева', iron: 'железа', water: 'воды' };

const HONEST: [string, string][] = [
  ['His cart is full of bags.', 'Его телега полна мешков.'],
  ['He shows his hands. They are empty.', 'Он показывает руки. Они пустые.'],
  ['He has an old horse and a small cart.', 'У него старая лошадь и маленькая телега.'],
];
const CLUES: [string, string][] = [
  ['There is blood on his boots.', 'На его сапогах кровь.'],
  ['He has a knife under his coat.', 'Под плащом у него нож.'],
  ['Other men are in the trees behind him.', 'За ним в деревьях другие люди.'],
];

const TRADE_OPTIONS = (o: NonNullable<Visitor['offer']>): Visitor['options'] => [
  { id: 'trade', text: `“Come in. Here is ${word(o.wantN)} ${o.want}.”` },
  { id: 'check', text: '“Show me your hands first.”' },
  { id: 'refuse', text: '“No, thank you. Go away.”' },
];

function offerOf(r: Rand): NonNullable<Visitor['offer']> {
  const [give, want] = shuffle(r, ['food', 'wood', 'iron', 'water'] as const);
  return {
    give,
    giveN: give === 'iron' ? int(r, 3, 5) : int(r, 5, 8),
    want,
    wantN: want === 'iron' ? int(r, 2, 4) : int(r, 4, 7),
  };
}

/** Утренний гость: с третьего дня примерно через день. */
export function rollVisitor(r: Rand, s: HoldState): Visitor | null {
  if (s.day < 3 || !chance(r, 0.45)) return null;
  const kind = pick(r, ['trader', 'trader', 'liar', 'liar', 'beggar', 'traveler'] as const);
  if (kind === 'trader' || kind === 'liar') {
    const offer = offerOf(r);
    const [detail, detailRu] = pick(r, kind === 'trader' ? HONEST : CLUES);
    const g = word(offer.giveN);
    const w = word(offer.wantN);
    const gr = `${RU_NUM[offer.giveN]} ${RU_RES[offer.give]}`;
    const wr = `${RU_NUM[offer.wantN]} ${RU_RES[offer.want]}`;
    const [speech, speechRu] = pick(r, [
      [
        `Hello. I sell things. I have ${g} ${offer.give} for you. I want ${w} ${offer.want}. Can I come in?`,
        `Здравствуйте. Я торговец. У меня для вас ${gr}. Я хочу ${wr}. Можно войти?`,
      ],
      [
        `Good morning! I have ${g} ${offer.give}. Give me ${w} ${offer.want}, and it is yours. Can I come in?`,
        `Доброе утро! У меня ${gr}. Дайте мне ${wr} — и это ваше. Можно войти?`,
      ],
      [
        `I am a trader from the south. ${g[0].toUpperCase()}${g.slice(1)} ${offer.give} for ${w} ${offer.want}. A good deal! Can I come in?`,
        `Я торговец с юга. ${gr} за ${wr}. Хорошая сделка! Можно войти?`,
      ],
    ] as [string, string][]);
    return { kind, speech, detail, ru: { speech: speechRu, detail: detailRu }, options: TRADE_OPTIONS(offer), offer };
  }
  if (kind === 'beggar') {
    const n = int(r, 2, 4);
    const nr = `${RU_NUM[n]} ${RU_RES.food}`;
    const [speech, speechRu] = pick(r, [
      [
        `Please help us. Our children are hungry. Can you give us ${word(n)} food?`,
        `Пожалуйста, помогите нам. Наши дети голодны. Можете дать нам ${nr}?`,
      ],
      [
        `We walked for five days. We have no food. Please, ${word(n)} food for the children.`,
        `Мы шли пять дней. У нас нет еды. Пожалуйста, ${nr} для детей.`,
      ],
      [
        `Our village burned. We have nothing now. Can you give us ${word(n)} food?`,
        `Наша деревня сгорела. У нас теперь ничего нет. Можете дать нам ${nr}?`,
      ],
    ] as [string, string][]);
    const [detail, detailRu] = pick(r, [
      ['A woman is with two small children.', 'Женщина с двумя маленькими детьми.'],
      ['An old man holds a little boy.', 'Старик держит маленького мальчика.'],
      ['A tired family stands in the snow.', 'Усталая семья стоит в снегу.'],
    ] as [string, string][]);
    return {
      kind,
      speech,
      detail,
      ru: { speech: speechRu, detail: detailRu },
      options: [
        { id: 'give', text: '“Yes. Take this food.”' },
        { id: 'deny', text: '“Sorry, we have no food for you.”' },
      ],
      ask: { res: 'food', n },
    };
  }
  const [speech, speechRu] = pick(r, [
    [
      'I am hurt and I am very thirsty. Give me water, please. I know a lot about this land.',
      'Я ранен, и мне очень хочется пить. Дайте мне воды, пожалуйста. Я много знаю об этих землях.',
    ],
    [
      'Water... please. I walked here from far away. I can tell you what is around your camp.',
      'Воды... пожалуйста. Я шёл сюда издалека. Я могу рассказать, что вокруг вашего лагеря.',
    ],
    [
      'I need water. I have no money, but I know these hills well.',
      'Мне нужна вода. Денег у меня нет, но я хорошо знаю эти холмы.',
    ],
  ] as [string, string][]);
  return {
    kind,
    speech,
    detail: 'His leg is hurt.',
    ru: { speech: speechRu, detail: 'У него ранена нога.' },
    options: [
      { id: 'give', text: '“Here is some water.”' },
      { id: 'deny', text: '“Go away. We need our water.”' },
    ],
    ask: { res: 'water', n: 2 },
  };
}

const clamp = (n: number) => Math.max(0, Math.min(MAX_MORALE, n));

/** Ответ гостю: что случилось — строками доклада, по-английски; гость уходит в любом случае. */
export function answerVisitor(s0: HoldState, answer: Answer): { state: HoldState; lines: string[] } {
  const v = s0.visitor;
  if (!v) return { state: s0, lines: [] };
  const s: HoldState = structuredClone(s0);
  const r = { s: s.rng };
  const lines: string[] = [];
  const people = present(s);
  const mood = (d: number) => {
    for (const p of people) p.morale = clamp(p.morale + d);
  };
  if (v.kind === 'trader' || v.kind === 'liar') {
    const o = v.offer!;
    if (answer === 'trade') {
      if (v.kind === 'liar') {
        const food = Math.min(s.res.food, 4);
        const wood = Math.min(s.res.wood, 4);
        s.res.food -= food;
        s.res.wood -= wood;
        const victim = people.length ? pick(r, people) : null;
        if (victim) victim.hp = Math.max(1, victim.hp - 1);
        mood(-1);
        lines.push(`It was a trap! Bandits ran in. They took ${food} food and ${wood} wood.`);
        if (victim) lines.push(`${victim.name} is hurt.`);
      } else if (s.res[o.want] < o.wantN) {
        lines.push(`You do not have ${word(o.wantN)} ${o.want}. The man goes away.`);
      } else {
        s.res[o.want] -= o.wantN;
        s.res[o.give] += o.giveN;
        lines.push(`You gave ${o.wantN} ${o.want}. You got ${o.giveN} ${o.give}. Good!`);
      }
    } else if (answer === 'check') {
      if (v.kind === 'liar') {
        mood(1);
        lines.push('He has a knife! But you are ready. He runs away into the forest.');
      } else lines.push('“I am a good man!” He is angry and goes away.');
    } else lines.push(v.kind === 'liar' ? 'He is angry. He goes into the forest.' : 'He says “OK” and goes away.');
  } else if (answer === 'give') {
    const a = v.ask!;
    if (s.res[a.res] < a.n) lines.push(`You do not have ${word(a.n)} ${a.res} to give.`);
    else {
      s.res[a.res] -= a.n;
      if (v.kind === 'beggar') {
        mood(1);
        lines.push('The woman says “Thank you!” Your people are happy.');
      } else {
        const hidden = placesOf(s.places).filter((x) => !x.p.known);
        if (hidden.length && s.places) {
          const { id, p, dir } = pick(r, hidden);
          s.places[id] = { ...p, known: true };
          lines.push(`He drinks. He tells you about ${PLACES[id].name} in the ${dir}. Now it is on your map.`);
        } else {
          s.res.iron += 3;
          lines.push('He drinks. He gives you three iron. “Thank you!”');
        }
      }
    }
  } else {
    if (v.kind === 'beggar') {
      mood(-1);
      for (const p of people) if (p.trait === 'kind') p.morale = clamp(p.morale - 1);
    }
    lines.push(v.kind === 'beggar' ? 'They go away. Your people are sad.' : 'He goes away.');
  }
  s.visitor = null;
  s.rng = r.s;
  return { state: s, lines };
}

/** Какой ответ был бы мудрым — для тестов и разбора: разбойника проверить, торговцу продать, если есть чем. */
export function wiseAnswer(s: HoldState): Answer | null {
  const v = s.visitor;
  if (!v) return null;
  if (v.kind === 'liar') return 'check';
  if (v.kind === 'trader') return s.res[v.offer!.want] >= v.offer!.wantN ? 'trade' : 'refuse';
  return s.res[v.ask!.res] >= v.ask!.n ? 'give' : 'deny';
}
