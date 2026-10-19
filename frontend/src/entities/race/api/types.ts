import type { CarId, Dyn, SimEvent } from '../model/sim';

/** Вид с сервера (`backend/src/race/race-view.ts`). */
export type RacePhase = 'none' | 'lobby' | 'countdown' | 'racing' | 'over';

export interface RaceRacer {
  slot: number;
  name: string | null;
  bot: boolean;
  car: CarId;
  me: boolean;
}

export interface RaceResultRow {
  slot: number;
  place: number;
  finishMs: number | null;
  progress: number;
  payout: number;
}

export interface RaceInfo {
  id: string;
  stake: number;
  pot: number;
  seed: number;
  lobbyEndsAt: number;
  startAt: number | null;
  racers: RaceRacer[];
  me: number | null;
  dyn: Dyn | null;
  events: SimEvent[];
  result: RaceResultRow[] | null;
}

export interface RaceConfig {
  stakes: number[];
  waitMs: number;
  delayMs: number;
}

export interface RaceWire {
  phase: RacePhase;
  serverNow: number;
  config: RaceConfig;
  race: RaceInfo | null;
}

/**
 * Вид плюс сдвиг часов: `Date.now() + offset` — оценка серверного времени.
 * Задержка сети в сдвиг не входит: браузер отстаёт от сервера на неё.
 */
export interface RaceView extends RaceWire {
  offset: number;
}
