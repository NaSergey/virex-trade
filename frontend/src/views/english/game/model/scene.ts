import type { RunRow } from '../../api/hooks';
import { alignScore, alignWords } from '../../model/align';
import { isCorrect } from '../../model/check';
import { isReply, type Scene, type SceneOption } from '../content/scenes/types';
import { pick, shuffle, type Rand } from './rng';

/**
 * Ход сцены (спека, «Сцены»): уровень 1 — выбор из трёх, 2 — собрать реплику
 * из слов, 3 — сказать вслух (или ввести). Терпение собеседника — 3; ошибка его
 * тратит, ноль — сцена провалена.
 */
export interface SceneLine {
  who: 'npc' | 'me';
  en: string;
  ru?: string;
  /** Почему ответ неверен — под реакцией собеседника. */
  why?: string;
  /** У своей реплики: false — верную показали после двух неудач. */
  ok?: boolean;
}

export interface SceneRun {
  id: string;
  level: 1 | 2 | 3;
  vars: Record<string, string>;
  /** Индекс шага: на шаге ответа сцена ждёт игрока. */
  step: number;
  patience: number;
  mistakes: number;
  /** Неудачи на текущем шаге (уровни 2 и 3). */
  tries: number;
  /** Вычеркнутые варианты (уровень 1). */
  struck: number[];
  options: SceneOption[] | null;
  bank: string[] | null;
  /** Уровень 3: текст реплик открывали — минус звезда. */
  peeked: boolean;
  /** Путеводитель ещё не потрачен. */
  guide: boolean;
  log: SceneLine[];
  done: null | 'ok' | 'fail';
}

const VAR = /\{(\w+)\}/g;

export const fill = (text: string, vars: Record<string, string>): string =>
  text.replace(VAR, (m, name: string) => vars[name] ?? m);

/** Все сочетания переменных строки — озвучка готовит каждое. */
export function combos(scene: Scene, text: string): string[] {
  const names = [...new Set([...text.matchAll(VAR)].map((m) => m[1]))].filter((n) => scene.vars?.[n]);
  let out: Record<string, string>[] = [{}];
  for (const name of names) out = out.flatMap((v) => scene.vars![name].map((value) => ({ ...v, [name]: value })));
  return [...new Set(out.map((v) => fill(text, v)))];
}

const okOf = (options: SceneOption[]) => options.find((o) => o.ok)!;

/** Варианты шага, заполненные: верный и два неверных (с переменной — из других её значений). */
function optionsOf(scene: Scene, options: SceneOption[], vars: Record<string, string>, r: Rand): SceneOption[] {
  const ok = okOf(options);
  const filled = (o: SceneOption, v = vars): SceneOption => ({
    ...o,
    en: fill(o.en, v),
    ru: fill(o.ru, v),
    ...(o.why ? { why: fill(o.why, v) } : {}),
    ...(o.react ? { react: fill(o.react, v) } : {}),
  });
  let wrong: SceneOption[] = [];
  if (ok.distract && scene.vars?.[ok.distract]) {
    const others = shuffle(
      r,
      scene.vars[ok.distract].filter((v) => v !== vars[ok.distract!]),
    ).slice(0, 2);
    wrong = others.map((value) => {
      const text = filled(ok, { ...vars, [ok.distract!]: value });
      // Объяснение и реакция — про то, что сказал собеседник, то есть верное значение.
      return { en: text.en, ru: text.ru, why: fill(ok.why ?? '', vars), react: fill(ok.react ?? 'Sorry?', vars) };
    });
  }
  wrong = [...wrong, ...options.filter((o) => !o.ok).map((o) => filled(o))].slice(0, 2);
  const right = filled(ok);
  return shuffle(r, [{ en: right.en, ru: right.ru, ok: true }, ...wrong]);
}

/** Реплики собеседника до следующего ответа; кончились шаги — сцена пройдена. */
function advance(run: SceneRun, scene: Scene, r: Rand): SceneRun {
  let { step } = run;
  const log = [...run.log];
  while (step < scene.steps.length) {
    const s = scene.steps[step];
    if (isReply(s)) break;
    log.push({ who: 'npc', en: fill(s.npc, run.vars), ru: fill(s.ru, run.vars) });
    step += 1;
  }
  if (step >= scene.steps.length) return { ...run, step, log, options: null, bank: null, done: 'ok' };
  const s = scene.steps[step];
  const options = isReply(s) ? optionsOf(scene, s.reply, run.vars, r) : null;
  const bank = run.level === 2 && options ? shuffle(r, okOf(options).en.split(' ')) : null;
  return { ...run, step, log, tries: 0, struck: [], options, bank };
}

export function startScene(
  scene: Scene,
  level: 1 | 2 | 3,
  r: Rand,
  opts: { patience: number; guide: boolean },
): SceneRun {
  const vars = Object.fromEntries(Object.entries(scene.vars ?? {}).map(([k, values]) => [k, pick(r, values)]));
  return advance(
    {
      id: scene.id,
      level,
      vars,
      step: 0,
      patience: opts.patience,
      mistakes: 0,
      tries: 0,
      struck: [],
      options: null,
      bank: null,
      peeked: false,
      guide: opts.guide,
      log: [],
      done: null,
    },
    scene,
    r,
  );
}

/** Уровень 3: открыть текст реплик — сцена теряет звезду. */
export const peek = (run: SceneRun): SceneRun => ({ ...run, peeked: true });

/** Ответ на шаге: индекс варианта (1), индексы банка (2), текст — голос или ввод (3). */
export function replyScene(
  run: SceneRun,
  scene: Scene,
  value: string | number | number[],
  r: Rand,
): { run: SceneRun; correct: boolean } {
  if (run.done || !run.options) return { run, correct: false };
  const step = scene.steps[run.step];
  const accept = isReply(step) ? (step.accept ?? []).map((a) => fill(a, run.vars)) : [];
  const ok = okOf(run.options);
  let correct: boolean;
  if (run.level === 1) {
    // Вычеркнутый вариант уже стоил терпения — повторное нажатие ничего не меняет.
    if (typeof value === 'number' && run.struck.includes(value)) return { run, correct: false };
    correct = typeof value === 'number' && run.options[value]?.ok === true;
  } else if (run.level === 2) {
    const text = Array.isArray(value) ? value.map((i) => run.bank![i]).join(' ') : '';
    correct = isCorrect(text, [ok.en, ...accept]);
  } else {
    const said = typeof value === 'string' ? value : '';
    correct = said.trim() !== '' && [ok.en, ...accept].some((t) => alignScore(alignWords(t, said)) >= 0.8);
  }

  if (correct) {
    const next = { ...run, log: [...run.log, { who: 'me' as const, en: ok.en, ok: true }], step: run.step + 1 };
    return { run: advance(next, scene, r), correct: true };
  }

  const free = run.guide && run.mistakes === 0;
  const patience = free ? run.patience : run.patience - 1;
  const base = { ...run, patience, mistakes: run.mistakes + 1, guide: run.guide && !free };
  if (run.level === 1) {
    const picked = typeof value === 'number' ? run.options[value] : undefined;
    const log = [...run.log, { who: 'npc' as const, en: picked?.react ?? 'Sorry?', why: picked?.why }];
    const struck = typeof value === 'number' ? [...run.struck, value] : run.struck;
    return { run: { ...base, log, struck, done: patience <= 0 ? 'fail' : null }, correct: false };
  }
  if (patience <= 0) {
    return { run: { ...base, log: [...run.log, { who: 'npc', en: 'Never mind.' }], done: 'fail' }, correct: false };
  }
  if (run.tries === 0) {
    const log = [...run.log, { who: 'npc' as const, en: 'Sorry?', why: 'Не так — попробуй ещё раз.' }];
    return { run: { ...base, log, tries: 1 }, correct: false };
  }
  // Вторая неудача: верную реплику показывают, шаг засчитан ошибкой.
  const shown = { ...base, log: [...run.log, { who: 'me' as const, en: ok.en, ok: false }], step: run.step + 1 };
  return { run: advance(shown, scene, r), correct: false };
}

/** Звёзды: без ошибок 3, одна — 2, больше — 1; провал — 0; подсмотренный текст на уровне 3 — минус одна. */
export function starsOf(run: SceneRun): 0 | 1 | 2 | 3 {
  if (run.done !== 'ok') return 0;
  const base = run.mistakes === 0 ? 3 : run.mistakes === 1 ? 2 : 1;
  return Math.max(1, base - (run.level === 3 && run.peeked ? 1 : 0)) as 1 | 2 | 3;
}

export interface SceneLevel {
  level: 1 | 2 | 3;
  /** Лучшие звёзды на уровнях 1, 2, 3. */
  best: [number, number, number];
  /** Когда игралась последний раз, мс. */
  lastAt: number;
}

/**
 * Уровни сцен — из сыгранного: сцена, пройденная на 2–3 звезды на своём
 * текущем уровне, поднимается на следующий (до 3). Отдельно не хранится.
 */
export function sceneLevels(runs: readonly RunRow[]): Map<string, SceneLevel> {
  const out = new Map<string, SceneLevel>();
  const ordered = [...runs].sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
  for (const run of ordered) {
    for (const s of run.stats.scenes ?? []) {
      const rec = out.get(s.id) ?? { level: 1, best: [0, 0, 0], lastAt: 0 };
      const best = [...rec.best] as [number, number, number];
      best[s.level - 1] = Math.max(best[s.level - 1], s.stars);
      const up = s.stars >= 2 && s.level === rec.level && rec.level < 3;
      out.set(s.id, {
        level: (up ? rec.level + 1 : rec.level) as 1 | 2 | 3,
        best,
        lastAt: Date.parse(run.finishedAt),
      });
    }
  }
  return out;
}

/**
 * Сцена станции: из открытых, не освоенных и не сыгранных недавно — чаще давно
 * не игранная; таких нет — любая не недавняя, затем любая открытая.
 */
export function pickScene(
  scenes: readonly Scene[],
  open: ReadonlySet<string>,
  levels: ReadonlyMap<string, SceneLevel>,
  recent: readonly string[],
  r: Rand,
): Scene | null {
  const opened = scenes.filter((s) => open.has(s.unit));
  const fresh = opened.filter((s) => !recent.includes(s.id));
  const learning = fresh.filter((s) => (levels.get(s.id)?.level ?? 1) < 3 || !levels.get(s.id)?.best[2]);
  const pool = learning.length > 0 ? learning : fresh.length > 0 ? fresh : opened;
  if (pool.length === 0) return null;
  const oldest = [...pool].sort((a, b) => (levels.get(a.id)?.lastAt ?? 0) - (levels.get(b.id)?.lastAt ?? 0));
  return pick(r, oldest.slice(0, 3));
}
