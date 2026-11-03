/**
 * Общие типы игры «Mind the Gap» (спека
 * docs/superpowers/specs/2026-11-04-english-game-design.md). Состояние забега
 * сериализуемо целиком: забег лежит в localStorage и продолжается с любого хода.
 */

/**
 * Вид удара. `recognize` — слово текстом → перевод; `listen` — звук → перевод;
 * `recall` — перевод → ввести слово; `speak` — перевод → сказать слово;
 * `order` и `dictate` — только у элит: собрать фразу, записать услышанное.
 */
export type Mode = 'recognize' | 'listen' | 'recall' | 'speak' | 'order' | 'dictate';

export const MODES: readonly Mode[] = ['recognize', 'listen', 'recall', 'speak', 'order', 'dictate'];

export type StationKind = 'fight' | 'elite' | 'scene' | 'shop' | 'rest' | 'find' | 'boss';

export type WeatherId = 'clear' | 'rain' | 'smog' | 'fog' | 'wind' | 'holiday' | 'rush';

export type Outcome = 'win' | 'dead' | 'quit';

/** Станция линии: ряд 1–10, путь 0–2, переходы — id станций следующего ряда. */
export interface Station {
  id: string;
  row: number;
  lane: 0 | 1 | 2;
  kind: StationKind;
  next: string[];
}

/** Слово забега. `tag` — что о нём видно до удара. */
export interface RunCard {
  id: string;
  en: string;
  ru: string;
  example?: [string, string];
  /** Раздел учебника или тема словаря — для неверных вариантов из той же темы. */
  group: string | null;
  /** new — новое; due — срок наступил; learning — в изучении; ahead — впрок; filler — добор. */
  tag: 'new' | 'due' | 'learning' | 'ahead' | 'filler';
  /** На сколько дней просрочено (у `due`), иначе 0. */
  overdueDays: number;
}

/**
 * Что ответ сделал с карточкой. Оценку по таблице спеки считает `gradeFor` на
 * состоянии карточки в момент ответа: карточку могли оценить на другом устройстве.
 */
export type Verdict = 'recall' | 'typo' | 'recognize' | 'wrong' | 'none';

export type SoundName = 'hit' | 'crit' | 'wrong' | 'hurt' | 'heal' | 'coin' | 'win' | 'lose' | 'step';

/** Побочное, которое движок не делает сам, а отдаёт странице. */
export type Effect =
  | { kind: 'card'; cardId: string; verdict: Exclude<Verdict, 'none'> }
  | { kind: 'exercise'; itemId: string; unit: string; correct: boolean }
  | { kind: 'count'; counter: 'game' | 'phrases' }
  | { kind: 'word'; en: string; ru: string }
  | { kind: 'sound'; name: SoundName };

export interface ModeTally {
  right: number;
  wrong: number;
}

/** Статистика забега — уходит в `english_runs.stats`; поля только добавляются, версия — `v`. */
export interface RunStats {
  v: 1;
  modes: Record<Mode, ModeTally>;
  boss: ModeTally & { reached: boolean; beaten: boolean };
  /** Отбито слов, на которых ошибся в этом забеге. */
  revenge: number;
  maxCombo: number;
  /** Новых слов, на которые ответили в забеге. */
  newWords: number;
  elites: number;
  /** Боёв без единой ошибки. */
  cleanFights: number;
  damage: number;
  /** Вспомнено — интервал продлён (верный `recall`/`speak` по карточке). */
  recalled: number;
  /** Узнано — верный выбор по выученной карточке со сроком, интервал не тронут. */
  recognized: number;
  scenes: { id: string; level: 1 | 2 | 3; stars: 0 | 1 | 2 | 3 }[];
  /** id карточек с ошибкой. */
  mistakes: string[];
  /** id упражнений хранителя с ошибкой. */
  bossMistakes: string[];
  /** Задания дня, выполненные к концу этого забега (за его день). */
  quests: string[];
}

export const emptyStats = (): RunStats => ({
  v: 1,
  modes: {
    recognize: { right: 0, wrong: 0 },
    listen: { right: 0, wrong: 0 },
    recall: { right: 0, wrong: 0 },
    speak: { right: 0, wrong: 0 },
    order: { right: 0, wrong: 0 },
    dictate: { right: 0, wrong: 0 },
  },
  boss: { right: 0, wrong: 0, reached: false, beaten: false },
  revenge: 0,
  maxCombo: 0,
  newWords: 0,
  elites: 0,
  cleanFights: 0,
  damage: 0,
  recalled: 0,
  recognized: 0,
  scenes: [],
  mistakes: [],
  bossMistakes: [],
  quests: [],
});
