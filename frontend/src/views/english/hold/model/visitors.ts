import { chance, int, pick, shuffle, type Rand } from '../../game/model/rng';
import { MAX_MORALE, present, type HoldState, type ResId } from './rules';
import { PLACES, type PlaceId } from './scout';

/**
 * Гости у ворот (шаг 4, спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md).
 *
 * Утром у ворот может стоять гость. Он говорит по-английски, рассказчик добавляет одну деталь о
 * нём — и решить, что ответить, можно, только прочитав обе строки. Торговец и разбойник под видом
 * торговца говорят одно и то же и получают одни и те же три ответа: отличает их только деталь
 * («His boots are red with fresh blood.» против «His cart is full of sacks.»). Голодные беженцы
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
  options: { id: Answer; text: string }[];
  /** Сделка торговца (и мнимая — у разбойника): он отдаёт `give`, хочет `want`. */
  offer?: { give: ResId; giveN: number; want: ResId; wantN: number };
  /** Чего просит беженец или путник. */
  ask?: { res: ResId; n: number };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const word = (n: number) => WORDS[n] ?? String(n);

const HONEST = [
  'His cart is full of sacks and tools.',
  'He shows you his empty hands and smiles.',
  'An old horse pulls his small cart.',
];
const CLUES = [
  'His boots are red with fresh blood.',
  'You see a knife under his coat.',
  'You hear other men moving in the trees behind him.',
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
    return {
      kind,
      speech: `Good morning. I am a trader. I have ${word(offer.giveN)} ${offer.give} for you. I want ${word(offer.wantN)} ${offer.want}. May I come in?`,
      detail: pick(r, kind === 'trader' ? HONEST : CLUES),
      options: TRADE_OPTIONS(offer),
      offer,
    };
  }
  if (kind === 'beggar') {
    const n = int(r, 2, 4);
    return {
      kind,
      speech: `Please help us. Our children are hungry. Can you give us ${word(n)} food?`,
      detail: 'A thin woman holds two small children by the hand.',
      options: [
        { id: 'give', text: '“Yes. Take this food.”' },
        { id: 'deny', text: '“Sorry, we have nothing to give.”' },
      ],
      ask: { res: 'food', n },
    };
  }
  return {
    kind,
    speech: 'I am hurt and very thirsty. Give me some water, and I will tell you a secret about these lands.',
    detail: 'There is a bloody cloth around his leg.',
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
        lines.push(`It was a trap! Bandits ran in after him and took ${food} food and ${wood} wood.`);
        if (victim) lines.push(`${victim.name} was hurt in the fight.`);
      } else if (s.res[o.want] < o.wantN) {
        lines.push(`You do not have ${word(o.wantN)} ${o.want}. The trader shakes his head and leaves.`);
      } else {
        s.res[o.want] -= o.wantN;
        s.res[o.give] += o.giveN;
        lines.push(`You gave ${o.wantN} ${o.want} and got ${o.giveN} ${o.give}. A good trade.`);
      }
    } else if (answer === 'check') {
      if (v.kind === 'liar') {
        mood(1);
        lines.push('He pulls out a knife — but you are ready. He runs back into the forest.');
      } else lines.push('“I am an honest man!” The trader is angry and goes away.');
    } else
      lines.push(v.kind === 'liar' ? 'He spits on the ground and walks into the trees.' : 'The trader nods and drives away.');
  } else if (answer === 'give') {
    const a = v.ask!;
    if (s.res[a.res] < a.n) lines.push(`You do not have ${word(a.n)} ${a.res} to give.`);
    else {
      s.res[a.res] -= a.n;
      if (v.kind === 'beggar') {
        mood(1);
        lines.push('The woman cries and thanks you. Your people feel proud.');
      } else {
        const hidden = (Object.keys(PLACES) as PlaceId[]).filter((id) => s.places && !s.places[id].known);
        if (hidden.length && s.places) {
          const id = pick(r, hidden);
          s.places[id] = { ...s.places[id], known: true };
          lines.push(`He drinks and tells you about ${PLACES[id].name} in the ${PLACES[id].dir}. Now it is on your map.`);
        } else {
          s.res.iron += 3;
          lines.push('He drinks and gives you three pieces of iron. “For your kindness.”');
        }
      }
    }
  } else {
    if (v.kind === 'beggar') mood(-1);
    lines.push(
      v.kind === 'beggar' ? 'They walk away slowly. Nobody in the camp speaks for a long time.' : 'He limps away into the cold.',
    );
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
