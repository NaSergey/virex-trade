import { DRAWING_COLORS, DRAWING_KINDS, type DPoint, type Drawing } from './types';

/**
 * Хранение рисунков сессии — единственное место, которое знает про localStorage.
 * Переезд на сервер (см. спек `2026-09-14-chart-drawings-design.md`) переписывает
 * этот модуль и хук `useSessionDrawings`, слой рисунков и панель не меняются.
 */

const PREFIX = 'virex:drawings:backtest:';
const VERSION = 1;

export type DrawingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Пользователь в ключе: на одном браузере бывают разные учётки (демо и своя), и чистка
    сирот по списку сессий одной не должна стирать рисунки другой. */
export const drawingsKey = (userId: string, sessionId: string) => `${PREFIX}${userId}:${sessionId}`;

const isPoint = (v: unknown): v is DPoint =>
  !!v && typeof v === 'object' && Number.isFinite((v as DPoint).t) && Number.isFinite((v as DPoint).p);

function isDrawing(v: unknown): v is Drawing {
  if (!v || typeof v !== 'object') return false;
  const d = v as Drawing;
  return (
    typeof d.id === 'string' &&
    DRAWING_KINDS.includes(d.kind) &&
    DRAWING_COLORS.includes(d.color) &&
    (d.width === 1 || d.width === 2 || d.width === 3) &&
    Array.isArray(d.points) &&
    d.points.length > 0 &&
    d.points.every(isPoint)
  );
}

/** Битая или чужая запись не роняет график: плохие фигуры отбрасываются поштучно. */
export function parseDrawings(raw: string | null): Drawing[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as { v?: number; drawings?: unknown };
    if (data?.v !== VERSION || !Array.isArray(data.drawings)) return [];
    return data.drawings.filter(isDrawing);
  } catch {
    return [];
  }
}

/** Цена — восемь значащих цифр, время — целые мс: кисть иначе хранила бы хвосты double. */
export function serializeDrawings(drawings: Drawing[]): string {
  return JSON.stringify({
    v: VERSION,
    drawings: drawings.map((d) => ({
      ...d,
      points: d.points.map((q) => ({ t: Math.round(q.t), p: Number(q.p.toPrecision(8)) })),
    })),
  });
}

/** `false` — не хватило места (QuotaExceededError): вызывающий показывает ошибку. */
export function saveDrawings(storage: DrawingStorage, userId: string, sessionId: string, drawings: Drawing[]): boolean {
  try {
    if (drawings.length === 0) storage.removeItem(drawingsKey(userId, sessionId));
    else storage.setItem(drawingsKey(userId, sessionId), serializeDrawings(drawings));
    return true;
  } catch {
    return false;
  }
}

/** Удаляет рисунки сессий, которых больше нет: иначе удалённые копятся и съедают лимит. */
export function pruneDrawings(storage: DrawingStorage, userId: string, keepIds: ReadonlySet<string>): void {
  const own = `${PREFIX}${userId}:`;
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(own) && !keepIds.has(key.slice(own.length))) stale.push(key);
  }
  stale.forEach((key) => storage.removeItem(key));
}
