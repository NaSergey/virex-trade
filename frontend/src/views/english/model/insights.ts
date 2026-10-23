import type { Exercise, Section } from '../content/types';
import type { VocabWord } from '../content/themes';
import { THEMES, type ThemeId } from '../content/themes';
import { activityOf, shiftDay, type DayRow } from './activity';
import { sectionItems, type AnswerRow } from './course';
import type { DeckCard } from './deck';
import { DAY, type CardState } from './srs';
import { plural } from './today';

/**
 * Разбор занятий: что сделано, где провалы и что учить дальше, чтобы начать
 * говорить. Только правила на уже загруженном состоянии — ни своих таблиц, ни
 * внешних сервисов; пороги — константы здесь же.
 */

/** Слово усвоено: «знаю» или интервал повторения от недели — оно уже держится в памяти. */
export const SETTLED_DAYS = 7;
/** Окно разбора занятий, дней. */
export const WINDOW = 14;
/** Самые частые слова мимо рекомендаций: артикли и местоимения учить карточкой незачем. */
const BASIC_RANK = 100;
/** «3 слова», «5 заданий» — число со склонённым словом. */
const n = (k: number, forms: readonly [string, string, string]) => `${k} ${plural(k, forms)}`;
const WORD = ['слово', 'слова', 'слов'] as const;
const TASK = ['задание', 'задания', 'заданий'] as const;

/** Темы, без которых разговор не начать: знакомство, мнения, чувства, люди, время, действия. */
const SPEAK_FIRST: ReadonlySet<ThemeId> = new Set(['greet', 'talk', 'feel', 'people', 'time', 'move', 'describe']);
/** Сколько слов в рекомендации — одна тема карточек на пару недель при 20 новых в день с запасом. */
export const MISSING_LIMIT = 30;

export const isSettled = (s: CardState | undefined) => !!s && (s.known || s.interval >= SETTLED_DAYS);

const key = (en: string) => en.trim().toLowerCase();

/** Слова (без регистра), усвоенные и начатые — по любой карточке с этим словом. */
export function wordSets(cards: readonly DeckCard[], states: ReadonlyMap<string, CardState>) {
  const settled = new Set<string>();
  const started = new Set<string>();
  for (const c of cards) {
    const s = states.get(c.id);
    if (!s) continue;
    started.add(key(c.en));
    if (isSettled(s)) settled.add(key(c.en));
  }
  return { settled, started };
}

export interface CoverageBand {
  top: number;
  settled: number;
}

/**
 * Покрытие частотного словаря: сколько из N самых частых слов усвоено. Первая
 * тысяча — около 80 % слов любого бытового разговора, поэтому это главное число
 * готовности говорить.
 */
export function coverage(vocab: readonly VocabWord[], settled: ReadonlySet<string>, tops: readonly number[]): CoverageBand[] {
  const ranked = vocab.filter((w) => w.rank <= 3000).sort((a, b) => a.rank - b.rank);
  return tops.map((top) => ({
    top,
    settled: ranked.filter((w) => w.rank <= top && settled.has(key(w.en))).length,
  }));
}

/** Ступень разговора по числу усвоенных слов — словами, а не уровнем CEFR: его по карточкам не определить. */
export function speakStage(settled: number): { title: string; next: number | null } {
  if (settled < 300) return { title: 'фразы выживания: поздороваться, спросить, попросить', next: 300 };
  if (settled < 800) return { title: 'простой разговор о себе, семье, работе и дне', next: 800 };
  if (settled < 1500) return { title: 'бытовой разговор: магазин, дорога, планы, мнения', next: 1500 };
  if (settled < 2500) return { title: 'свободный разговор на знакомые темы', next: 2500 };
  return { title: 'разговор почти на любую бытовую тему', next: null };
}

export interface Mix {
  cards: number;
  answers: number;
  correct: number;
  phrases: number;
  quiz: number;
  activeDays: number;
  total: number;
}

/** Занятия за последние `n` дней, сегодня включительно. */
export function activityMix(days: ReadonlyMap<string, DayRow>, today: string, n = WINDOW): Mix {
  const m: Mix = { cards: 0, answers: 0, correct: 0, phrases: 0, quiz: 0, activeDays: 0, total: 0 };
  for (let i = 0; i < n; i++) {
    const r = days.get(shiftDay(today, i));
    if (!r) continue;
    m.cards += r.cards;
    m.answers += r.answers;
    m.correct += r.correct;
    m.phrases += r.phrases;
    m.quiz += r.quiz ?? 0;
    if (activityOf(r) > 0) m.activeDays += 1;
  }
  m.total = m.cards + m.answers + m.phrases + m.quiz;
  return m;
}

export interface Score {
  right: number;
  wrong: number;
}

export const accuracy = (s: Score) => (s.right + s.wrong ? s.right / (s.right + s.wrong) : null);

/**
 * Точность по виду задания, по всем попыткам. Выбор варианта — узнавание,
 * перевод и сборка фразы — уже речь: разрыв между ними и есть «понимаю, но не
 * могу сказать».
 */
export function byType(exercises: readonly Exercise[], answers: ReadonlyMap<string, AnswerRow>) {
  const out: Record<Exercise['type'], Score> = {
    choice: { right: 0, wrong: 0 },
    gap: { right: 0, wrong: 0 },
    order: { right: 0, wrong: 0 },
    translate: { right: 0, wrong: 0 },
  };
  for (const e of exercises) {
    const a = answers.get(e.id);
    if (!a) continue;
    out[e.type].right += a.right;
    out[e.type].wrong += a.wrong;
  }
  return out;
}

export interface WeakUnit {
  section: Section;
  score: Score;
  /** Заданий с неверным последним ответом. */
  open: number;
}

/** Попыток в разделе, после которых точность что-то значит. */
const MIN_TRIES = 5;
const WEAK_ACCURACY = 0.7;

/** Разделы, где грамматика не легла: точность ниже 70 % или три задания всё ещё с ошибкой. */
export function weakUnits(
  course: readonly Section[],
  exercises: readonly Exercise[],
  answers: ReadonlyMap<string, AnswerRow>,
): WeakUnit[] {
  const out: WeakUnit[] = [];
  for (const section of course) {
    if (section.kind !== 'unit') continue;
    const score: Score = { right: 0, wrong: 0 };
    let open = 0;
    for (const e of sectionItems(section, exercises)) {
      const a = answers.get(e.id);
      if (!a) continue;
      score.right += a.right;
      score.wrong += a.wrong;
      if (!a.lastCorrect) open += 1;
    }
    const acc = accuracy(score);
    const tries = score.right + score.wrong;
    if ((tries >= MIN_TRIES && acc !== null && acc < WEAK_ACCURACY) || open >= 3) out.push({ section, score, open });
  }
  return out.sort((a, b) => (accuracy(a.score) ?? 1) - (accuracy(b.score) ?? 1));
}

/** Трудное слово: забывалось дважды и больше или повторение всё время «трудно». */
export function hardWords(cards: readonly DeckCard[], states: ReadonlyMap<string, CardState>, limit = 15) {
  const out: { card: DeckCard; state: CardState }[] = [];
  for (const card of cards) {
    const s = states.get(card.id);
    if (!s || s.known) continue;
    if (s.lapses >= 2 || (s.reps >= 4 && s.ease <= 1.7)) out.push({ card, state: s });
  }
  return out
    .sort((a, b) => b.state.lapses - a.state.lapses || a.state.ease - b.state.ease)
    .slice(0, limit);
}

/** Эталонная фраза задания: то, что нужно было сказать. */
export function expectedText(e: Exercise): string {
  switch (e.type) {
    case 'choice':
      return e.q.replace('___', e.options[e.answer] ?? '');
    case 'gap':
      return e.q.replace('___', e.answers[0] ?? '');
    default:
      return e.answers[0] ?? '';
  }
}

const tokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z']+/)
    .map((t) => t.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
    .filter(Boolean);

export type Reason = 'mistake' | 'book' | 'speak' | 'frequent';

/**
 * Доля группы в подборке: ошибки и долги учебника не должны вытеснить слова
 * для разговора — ради них подборка и делается.
 */
const CAP: Partial<Record<Reason, number>> = { mistake: 10, book: 8 };

export interface Missing {
  card: DeckCard;
  reason: Reason;
}

/**
 * Слова, которых не хватает, по убыванию важности:
 * 1. из заданий с ошибкой — эталонная фраза содержала слово, которое не держится;
 * 2. из пройденных уроков учебника — урок отмечен, а его слова не начаты;
 * 3. частые слова разговорных тем (знакомство, мнения, чувства…) — ранг вдвое ценнее;
 * 4. остальные частые слова по рангу.
 * Ошибкам и учебнику — не больше `CAP`, остальное место — словам для речи.
 * Слово, уже начатое в карточках, не предлагается: его и так покажет повторение.
 */
export function missingWords(input: {
  cards: readonly DeckCard[];
  states: ReadonlyMap<string, CardState>;
  vocab: readonly VocabWord[];
  exercises: readonly Exercise[];
  answers: ReadonlyMap<string, AnswerRow>;
  done: ReadonlySet<string>;
  limit?: number;
}): Missing[] {
  const { cards, states, vocab, exercises, answers, done, limit = MISSING_LIMIT } = input;
  const { started } = wordSets(cards, states);
  const rank = new Map(vocab.map((w) => [key(w.en), w.rank]));
  // Слово — одна карточка: у учебника приоритет, он и даёт контекст урока.
  const byWord = new Map<string, DeckCard>();
  for (const c of cards) if (c.source !== 'my' && !byWord.has(key(c.en))) byWord.set(key(c.en), c);

  const picked = new Map<string, Missing>();
  const taken: Partial<Record<Reason, number>> = {};
  const take = (en: string, reason: Reason) => {
    const k = key(en);
    const card = byWord.get(k);
    if (!card || started.has(k) || picked.has(k)) return;
    if ((rank.get(k) ?? Infinity) <= BASIC_RANK) return;
    if ((taken[reason] ?? 0) >= (CAP[reason] ?? Infinity)) return;
    taken[reason] = (taken[reason] ?? 0) + 1;
    picked.set(k, { card, reason });
  };

  const hits = new Map<string, number>();
  for (const e of exercises) {
    if (answers.get(e.id)?.lastCorrect !== false) continue;
    for (const t of new Set(tokens(expectedText(e)))) hits.set(t, (hits.get(t) ?? 0) + 1);
  }
  [...hits]
    .sort((a, b) => b[1] - a[1] || (rank.get(a[0]) ?? 9999) - (rank.get(b[0]) ?? 9999))
    .forEach(([t]) => take(t, 'mistake'));

  for (const c of cards) if (c.source === 'book' && done.has(c.group ?? '')) take(c.en, 'book');

  const score = (w: VocabWord) => (SPEAK_FIRST.has(w.theme) ? w.rank / 2 : w.rank);
  [...vocab]
    .filter((w) => w.theme !== 'func')
    .sort((a, b) => score(a) - score(b))
    .forEach((w) => take(w.en, SPEAK_FIRST.has(w.theme) ? 'speak' : 'frequent'));

  return [...picked.values()].slice(0, limit);
}

export interface ThemeGap {
  id: ThemeId;
  title: string;
  settled: number;
  total: number;
}

/** Разговорные темы словаря с долей усвоенного — слабые сверху. */
export function themeGaps(cards: readonly DeckCard[], states: ReadonlyMap<string, CardState>): ThemeGap[] {
  return THEMES.filter((t) => t.id !== 'func')
    .map((t) => {
      const deck = cards.filter((c) => c.source === 'vocab' && c.group === t.id);
      return {
        id: t.id,
        title: t.title,
        settled: deck.filter((c) => isSettled(states.get(c.id))).length,
        total: deck.length,
      };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => a.settled / a.total - b.settled / b.total);
}

/** Карточки с наступившим сроком — долг повторения. */
export function dueCount(states: ReadonlyMap<string, CardState>, now: number): number {
  let n = 0;
  for (const s of states.values()) if (!s.known && s.due <= now) n += 1;
  return n;
}

/** Доля начатых, но ни разу не забытых слов среди изучаемых: ниже 70 % — новых слишком много. */
export function retention(states: ReadonlyMap<string, CardState>): number | null {
  let seen = 0;
  let clean = 0;
  for (const s of states.values()) {
    if (s.known && s.reps === 1) continue; // отсеяно «знаю» с первого показа — не учили
    if (s.reps < 2) continue;
    seen += 1;
    if (s.lapses === 0) clean += 1;
  }
  return seen >= 20 ? clean / seen : null;
}

export type Level = 'high' | 'mid' | 'low';

export interface Advice {
  id: string;
  level: Level;
  title: string;
  text: string;
  /** Куда идти: адрес раздела учебника. */
  href?: string;
  /** Колода карточек, которую ставит кнопка (`virex.english.deck`). */
  deck?: string;
  action?: string;
}

export interface AdviceInput {
  now: number;
  mix: Mix;
  settled: number;
  top500: CoverageBand;
  types: ReturnType<typeof byType>;
  weak: WeakUnit[];
  hard: number;
  due: number;
  retention: number | null;
  mistakes: number;
  current: Section | null;
  lastLessonAt: number | null;
  gaps: ThemeGap[];
}

/**
 * Советы по правилам, самые важные сверху. Главный принцип — путь к речи:
 * сначала регулярность и говорение вслух, потом частые слова, потом точность.
 */
export function advise(i: AdviceInput): Advice[] {
  const out: Advice[] = [];
  const share = (n: number) => (i.mix.total ? n / i.mix.total : 0);

  if (i.mix.total === 0) {
    out.push({
      id: 'start',
      level: 'high',
      title: 'Начни с 15 минут в день',
      text: 'За две недели занятий нет. Короткое ежедневное занятие держит слова лучше, чем час раз в неделю: урок, 10 заданий, 5 фраз вслух и карточки.',
      href: '/english',
      action: 'План на сегодня',
    });
    return out;
  }

  if (i.mix.activeDays < WINDOW / 2) {
    out.push({
      id: 'regular',
      level: 'high',
      title: 'Занимайся каждый день, пусть и меньше',
      text: `Занятия были ${i.mix.activeDays} из ${WINDOW} дней. Интервальное повторение работает, только когда долги не копятся: 15 минут ежедневно дадут больше, чем те же часы рывками.`,
    });
  }

  if (i.mix.phrases < 20 || share(i.mix.phrases) < 0.15) {
    out.push({
      id: 'speak',
      level: 'high',
      title: 'Говори вслух каждый день',
      text: `За ${WINDOW} дней вслух и на слух — ${n(i.mix.phrases, ['фраза', 'фразы', 'фраз'])}, ${Math.round(share(i.mix.phrases) * 100)} % занятий. Карточки учат узнавать слово, а говорить учит только речь: 5–10 фраз в день в «Произношении», каждую — повторить за диктором, потом сказать самому.`,
      href: '/english/speak',
      action: 'К речи',
    });
  }

  const recog = accuracy(i.types.choice);
  const prod = accuracy({
    right: i.types.translate.right + i.types.order.right,
    wrong: i.types.translate.wrong + i.types.order.wrong,
  });
  if (recog !== null && prod !== null && recog - prod >= 0.15) {
    out.push({
      id: 'produce',
      level: 'high',
      title: 'Понимаешь, но фразу не собираешь',
      text: `Выбор варианта верен на ${Math.round(recog * 100)} %, перевод и сборка фразы — на ${Math.round(prod * 100)} %. Это и есть барьер «понимаю, но не могу сказать»: переводи задания вслух, прежде чем писать, и проговаривай готовую фразу целиком.`,
      href: '/english/practice?unit=mistakes',
      action: 'Работа над ошибками',
    });
  }

  if (i.due > 50) {
    out.push({
      id: 'due',
      level: 'high',
      title: 'Сначала долги по карточкам',
      text: `${n(i.due, ['карточка', 'карточки', 'карточек'])} ждут повторения. Пока долг не разобран, новые слова вытесняют старые — поставь лимит новых 10 в день на неделю.`,
      href: '/english/cards',
      action: 'К карточкам',
    });
  }

  if (i.retention !== null && i.retention < 0.7) {
    out.push({
      id: 'retention',
      level: 'mid',
      title: 'Новых слов больше, чем держит память',
      text: `Без единой ошибки запомнилось ${Math.round(i.retention * 100)} % слов. Уменьши лимит новых и к каждому трудному слову проговори свой пример вслух — слово в своей фразе держится дольше.`,
      href: '/english/cards',
      action: 'К карточкам',
    });
  }

  if (i.top500.settled < i.top500.top * 0.8) {
    out.push({
      id: 'core',
      level: 'mid',
      title: 'Добери 500 самых частых слов',
      text: `Усвоено ${i.top500.settled} из ${i.top500.top}. Эти слова — больше половины любой речи: без них не помогут ни грамматика, ни редкие слова. Учи общий словарь по частоте — или подборку ниже.`,
      deck: 'vocab',
      action: 'Учить общий словарь',
    });
  }

  for (const w of i.weak.slice(0, 2)) {
    const acc = accuracy(w.score);
    out.push({
      id: `weak:${w.section.id}`,
      level: 'mid',
      title: `Повтори ${w.section.title}`,
      text: `Точность ${acc === null ? '—' : `${Math.round(acc * 100)} %`}${w.open ? `, с ошибкой ${n(w.open, TASK)}` : ''}. Грамматика: ${w.section.grammar.join('; ') || w.section.topic}. Перечитай урок и пройди его задания ещё раз.`,
      href: `/english/practice?unit=${w.section.id}`,
      action: 'К заданиям',
    });
  }

  if (i.mistakes > 0 && !out.some((a) => a.id === 'produce')) {
    out.push({
      id: 'mistakes',
      level: 'mid',
      title: 'Закрой ошибки',
      text: `${n(i.mistakes, TASK)} всё ещё с неверным последним ответом. Ошибка, к которой вернулся через день, запоминается лучше правила.`,
      href: '/english/practice?unit=mistakes',
      action: 'Работа над ошибками',
    });
  }

  if (i.hard > 0) {
    out.push({
      id: 'hard',
      level: 'mid',
      title: 'Трудные слова — в свою фразу',
      text: `${n(i.hard, WORD)} забываются снова и снова. Зубрёжка их не возьмёт: придумай к каждому фразу про себя («I usually…», «My boss…») и скажи её вслух.`,
    });
  }

  if (i.current && (i.lastLessonAt === null || i.now - i.lastLessonAt > 7 * DAY)) {
    out.push({
      id: 'lesson',
      level: 'mid',
      title: 'Учебник стоит',
      text: `Новый урок не открывался больше недели. Грамматика курса — каркас, на который ложатся слова. Следующий: ${i.current.title} (${i.current.topic}).`,
      href: `/english/lessons?s=${i.current.id}`,
      action: 'К уроку',
    });
  }

  const gap = i.gaps.find((g) => SPEAK_FIRST.has(g.id));
  if (gap) {
    out.push({
      id: `theme:${gap.id}`,
      level: 'low',
      title: `Тема «${gap.title}»`,
      text: `Усвоено ${gap.settled} из ${gap.total}. Без этой темы разговор начинается с пауз — её слова нужны в первые минуты любой беседы.`,
      deck: `theme:${gap.id}`,
      action: 'Учить тему',
    });
  }

  out.push(
    i.settled < 300
      ? {
          id: 'method',
          level: 'low',
          title: 'Учи фразы целиком',
          text: 'На старте говорят готовыми кусками: «Can I have…», «I’d like to…», «What do you mean?». Каждый вечер — минута рассказа о себе вслух из слов, которые уже знаешь; запиши на телефон и послушай.',
        }
      : {
          id: 'method',
          level: 'low',
          title: 'Shadowing и рассказ о дне',
          text: 'Повторяй фразу одновременно с диктором (shadowing) — так ставятся ритм и связность. Вечером расскажи вслух две минуты о своём дне; споткнулся на слове — добавь его в «Мои слова».',
        },
  );

  return out;
}
