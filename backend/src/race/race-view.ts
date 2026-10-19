import { DELAY_MS, STAKES, WAIT_MS } from './race.config';
import type { RaceRuntime } from './race-runtime';
import { COUNTDOWN, dynOf, type CarId, type Dyn, type SimEvent } from './sim';

export interface Entry {
  /** id строки `RaceEntry`; у бота до старта строки нет — пусто. */
  entryId: string;
  slot: number;
  userId: string | null;
  name: string | null;
  car: CarId;
  joinedAt: Date;
  bot: boolean;
}

export interface ResultRow {
  slot: number;
  place: number;
  finishMs: number | null;
  progress: number;
  payout: number;
}

/** Гонка в памяти процесса игр — от открытия лобби до забвения итога. */
export interface RaceRecord {
  id: string;
  stake: number;
  seed: number;
  createdAt: number;
  lobbyEndsAt: number;
  entries: Entry[];
  runtime: RaceRuntime | null;
  result: ResultRow[] | null;
  finishing: boolean;
  closed: boolean;
}

export type RacePhase = 'none' | 'lobby' | 'countdown' | 'racing' | 'over';

/** Снимок гонки. Тайного в гонке нет — каждому одно и то же, кроме пометки «я». */
export interface RaceWire {
  phase: RacePhase;
  serverNow: number;
  config: { stakes: number[]; waitMs: number; delayMs: number };
  race: null | {
    id: string;
    stake: number;
    pot: number;
    seed: number;
    lobbyEndsAt: number;
    /** Время сервера, когда загорелся первый красный огонь; до старта — null. */
    startAt: number | null;
    racers: {
      slot: number;
      name: string | null;
      bot: boolean;
      car: CarId;
      me: boolean;
    }[];
    me: number | null;
    dyn: Dyn | null;
    events: SimEvent[];
    result: ResultRow[] | null;
  };
}

export function phaseOf(rec: RaceRecord | null): RacePhase {
  if (!rec) return 'none';
  if (rec.result) return 'over';
  if (!rec.runtime) return 'lobby';
  return rec.runtime.state.t < COUNTDOWN ? 'countdown' : 'racing';
}

export function buildView(
  rec: RaceRecord | null,
  userId: string,
  now: number,
  events: SimEvent[],
): RaceWire {
  const config = { stakes: STAKES, waitMs: WAIT_MS, delayMs: DELAY_MS };
  if (!rec) return { phase: 'none', serverNow: now, config, race: null };
  const me = rec.entries.find((e) => e.userId === userId)?.slot ?? null;
  return {
    phase: phaseOf(rec),
    serverNow: now,
    config,
    race: {
      id: rec.id,
      stake: rec.stake,
      pot: rec.stake * 3,
      seed: rec.seed,
      lobbyEndsAt: rec.lobbyEndsAt,
      startAt: rec.runtime?.startAt ?? null,
      racers: rec.entries.map((e) => ({
        slot: e.slot,
        name: e.name,
        bot: e.bot,
        car: e.car,
        me: e.slot === me,
      })),
      me,
      dyn: rec.runtime ? dynOf(rec.runtime.state) : null,
      events,
      result: rec.result,
    },
  };
}
