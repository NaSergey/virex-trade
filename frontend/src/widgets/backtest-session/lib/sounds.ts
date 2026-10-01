import type { BacktestEntryOrder, ExitReason, SessionDetail } from '../api/types';

/**
 * Сигналы терминала. Звучат в духе Bybit (решение владельца 2026-09-26), но
 * это не его звук: ноты, интервалы и тайминги свои. Смысл несёт мелодия:
 * вверх — хорошо, вниз — плохо, одна нота — служебное. Спека —
 * `docs/superpowers/specs/2026-09-26-terminal-sounds-design.md`.
 */
export type TerminalSound =
  | 'fill' // ордер исполнен: открытие, добор, частичное или ручное закрытие, лимитка на закрытие
  | 'take' // сделка закрыта тейком
  | 'stop' // сделка закрыта стопом
  | 'placed' // выставлен отложенный ордер
  | 'cancel' // отложенный ордер снят без исполнения
  | 'reject'; // сервер отказал в действии

/** Что из снимка сессии нужно, чтобы вывести сигналы. */
export type Snapshot = Pick<SessionDetail, 'trades' | 'closeOrders' | 'entryOrders'>;

/**
 * Закрытие по причине. `finish` молчит: это конец сессии, а не исполнение и не
 * ответ рынка. Ручное закрытие и лимитка на закрытие — исполненный ордер.
 */
const EXIT: Record<ExitReason, TerminalSound | null> = {
  stop: 'stop',
  take: 'take',
  manual: 'fill',
  limit: 'fill',
  finish: null,
};

/** Порядок в одном снимке: сначала то, что важнее. */
const PRIORITY: readonly TerminalSound[] = ['stop', 'take', 'fill', 'placed', 'cancel'];

/**
 * Сигналы перехода от снимка к снимку — каждый не больше раза, по важности.
 *
 * Источник — разница состояний, а не события действий: так одна проверка
 * покрывает клик, срабатывание в прокрутке, движок эфира и вторую вкладку.
 *
 * Отложенный ордер пропадает и при своём исполнении, и при полном закрытии
 * позиции (сервер снимает лимиты закрытия сделки), поэтому «снят» и
 * «выставлен» звучат, только если со сделками в этом снимке не случилось
 * ничего: «отмена» поверх стопа была бы враньём.
 *
 * Перенос лимита на вход молчит, как правка стопа: сервер делает его снятием и
 * новым ордером с теми же условиями (`moveEntryOrder`), и такая пара — не
 * отмена и выставление, а правка цены.
 */
export function soundsOf(prev: Snapshot, next: Snapshot): TerminalSound[] {
  const found = new Set<TerminalSound>();
  // Закрытие по `finish` звука не даёт, но исчезновение ордеров объясняет.
  let traded = false;
  const before = new Map(prev.trades.map((t) => [t.id, t]));
  for (const t of next.trades) {
    const was = before.get(t.id);
    const opened = !was;
    const added = !!was && t.entries.length > was.entries.length;
    // Частичное закрытие — только у оставшейся открытой: полное скажет причина выхода.
    const reduced = !!was && t.exitTime == null && t.closedQty > was.closedQty;
    if (opened || added || reduced) {
      found.add('fill');
      traded = true;
    }
    // Сделка, пришедшая уже закрытой (эфир опрашивается раз в три секунды),
    // даёт и открытие, и закрытие.
    if (t.exitTime != null && (!was || was.exitTime == null)) {
      traded = true;
      const s = t.exitReason ? EXIT[t.exitReason] : null;
      if (s) found.add(s);
    }
  }
  if (!traded) {
    const prevIds = orderIds(prev);
    const nextIds = orderIds(next);
    // Условия снятых лимитов на вход; новый лимит с теми же условиями — перенос
    // одного из них, и каждый снятый закрывает не больше одного нового.
    const gone = prev.entryOrders.filter((o) => !nextIds.has(o.id)).map(entryTerms);
    const movedFrom = (o: BacktestEntryOrder) => {
      const i = gone.indexOf(entryTerms(o));
      if (i >= 0) gone.splice(i, 1);
      return i >= 0;
    };
    const newEntries = next.entryOrders.filter((o) => !prevIds.has(o.id) && !movedFrom(o));
    if (newEntries.length > 0 || next.closeOrders.some((o) => !prevIds.has(o.id))) found.add('placed');
    if (gone.length > 0 || prev.closeOrders.some((o) => !nextIds.has(o.id))) found.add('cancel');
  }
  return PRIORITY.filter((s) => found.has(s));
}

const orderIds = (s: Snapshot) => new Set([...s.closeOrders.map((o) => o.id), ...s.entryOrders.map((o) => o.id)]);

/** Всё, что у лимита на вход не меняет перенос, — всё, кроме цены и id. */
const entryTerms = (o: BacktestEntryOrder) =>
  [o.symbol, o.direction, o.riskPct, o.stopLoss, o.takeProfit, o.leverage].join('|');

/**
 * Голос сигнала — одна нота синтезатора. Времена — мс от начала сигнала;
 * `to` — скольжение частоты к концу `glide`.
 */
export interface Voice {
  wave?: OscillatorType | 'noise';
  /** У шума не нужна. */
  freq?: number;
  to?: number;
  glide?: number;
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number };
}

// Ноты — равномерно темперированный строй от A4 = 440.
const A4 = 440;
const E5 = 659.26;
const G5 = 783.99;
const C6 = 1046.5;
const G6 = 1567.98;
const C7 = 2093;

/** Во сколько раз нота начинается выше своего тона и за сколько мс на него садится. */
const TUK = 1.2;
const TUK_MS = 12;

/**
 * Нота в духе Bybit: чистый синус, который начинается чуть выше и за 12 мс
 * садится на тон — отсюда «тук» в начале, — со слабой второй гармоникой и
 * экспоненциальным затуханием.
 */
function ding(freq: number, at: number, dur: number, gain: number): Voice[] {
  return [
    { freq: freq * TUK, to: freq, glide: TUK_MS, at, dur, gain, attack: 8 },
    { freq: freq * 2, at, dur: dur * 0.6, gain: gain * 0.05, attack: 8 },
  ];
}

/** Щелчок в начале сигнала — короткий шум выше 6 кГц. */
const click = (gain = 0.06): Voice => ({ wave: 'noise', dur: 8, gain, attack: 1, filter: { type: 'highpass', freq: 6000 } });

/**
 * Сигналы — одно семейство нот. Исполнение — квинта вверх, вторая нота тише;
 * тейк — та же квинта и октава сверху; стоп — малая терция вниз, ниже
 * исполнения; служебные — короткие и тихие, без щелчка; отказ — два низких
 * одинаковых «нет». Подобраны расчётом, без прослушивания, — править по уху.
 */
export const VOICES: Record<TerminalSound, readonly Voice[]> = {
  fill: [click(), ...ding(C6, 0, 380, 0.3), ...ding(G6, 110, 400, 0.13)],
  take: [click(), ...ding(C6, 0, 300, 0.26), ...ding(G6, 100, 320, 0.18), ...ding(C7, 200, 560, 0.14)],
  stop: [click(), ...ding(G5, 0, 380, 0.3), ...ding(E5, 130, 520, 0.26)],
  placed: ding(C7, 0, 140, 0.12),
  cancel: [...ding(G6, 0, 120, 0.1), ...ding(C6, 70, 180, 0.1)],
  reject: [click(0.05), ...ding(A4, 0, 150, 0.28), ...ding(A4, 170, 180, 0.28)],
};

/** Длина сигнала, мс: следующий сигнал того же снимка ждёт конца предыдущего. */
export const lengthOf = (s: TerminalSound) => Math.max(...VOICES[s].map((v) => (v.at ?? 0) + v.dur));

/** Пауза между сигналами одного снимка, мс. */
export const GAP_MS = 60;

/** Когда звучит каждый сигнал снимка (мс от прихода): подряд, без наложения. */
export function schedule(sounds: readonly TerminalSound[]): { sound: TerminalSound; delay: number }[] {
  let at = 0;
  return sounds.map((sound) => {
    const delay = at;
    at += lengthOf(sound) + GAP_MS;
    return { sound, delay };
  });
}
