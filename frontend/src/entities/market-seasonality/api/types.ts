/**
 * Отрезок недели — все свечи одного таймфрейма, открывшиеся в этот день недели
 * и в это время суток (UTC). Ответ `GET /api/market-events/seasonality`.
 */
export interface TimeSlot {
  weekday: number; // getUTCDay(): 0 — воскресенье
  minute: number; // минута суток UTC открытия свечи; у дневной — 0
  samples: number;
  upSamples: number; // закрылись выше открытия
  downSamples: number; // закрылись ниже открытия
  /** Доля роста среди свечей, которые сдвинулись. */
  upPct: number;
  avgChangePct: number;
}

export interface Seasonality {
  timeframe: number;
  slots: TimeSlot[];
  totalSamples: number;
}
