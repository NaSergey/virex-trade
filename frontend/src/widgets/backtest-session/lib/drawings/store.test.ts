import { describe, expect, it } from 'vitest';
import {
  drawingsKey,
  EXCHANGE_DRAWINGS,
  parseDrawings,
  pruneDrawings,
  saveDrawings,
  serializeDrawings,
  type DrawingStorage,
} from './store';
import type { Drawing } from './types';

function memoryStorage(quota = Infinity): DrawingStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > quota) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

const line: Drawing = { id: 'a', kind: 'trend', color: 'blue', width: 2, points: [{ t: 1, p: 100.123456789 }, { t: 2, p: 101 }] };

describe('store', () => {
  it('сохраняет и читает обратно, округляя цену', () => {
    const back = parseDrawings(serializeDrawings([line]));
    expect(back).toHaveLength(1);
    expect(back[0].points[0].p).toBe(100.12346);
  });
  it('битый JSON и чужая версия дают пустой список', () => {
    expect(parseDrawings('{oops')).toEqual([]);
    expect(parseDrawings(JSON.stringify({ v: 99, drawings: [line] }))).toEqual([]);
  });
  it('плохие фигуры отбрасываются поштучно', () => {
    const raw = JSON.stringify({ v: 1, drawings: [line, { ...line, kind: 'circle' }, { ...line, points: [] }] });
    expect(parseDrawings(raw)).toHaveLength(1);
  });
  it('нехватка места — false, а не исключение', () => {
    expect(saveDrawings(memoryStorage(10), 'u', 's1', [line])).toBe(false);
  });
  it('пустой список удаляет ключ', () => {
    const s = memoryStorage();
    saveDrawings(s, 'u', 's1', [line]);
    saveDrawings(s, 'u', 's1', []);
    expect(s.getItem(drawingsKey('u', 's1'))).toBeNull();
  });
  it('prune удаляет только рисунки несуществующих сессий своего пользователя', () => {
    const s = memoryStorage();
    saveDrawings(s, 'u', 'keep', [line]);
    saveDrawings(s, 'u', 'gone', [line]);
    saveDrawings(s, 'other', 'gone', [line]);
    s.setItem('virex:theme', 'dark');
    pruneDrawings(s, 'u', new Set(['keep']));
    expect([...s.data.keys()].sort()).toEqual([drawingsKey('u', 'keep'), drawingsKey('other', 'gone'), 'virex:theme'].sort());
  });
  it('prune судит по сессии, а не по ключу целиком: рисунки монет живой сессии и биржевого терминала остаются', () => {
    // У монеты эфира ключ — «сессия:монета», у терминала биржи сессии нет вовсе.
    const s = memoryStorage();
    saveDrawings(s, 'u', 'keep:ETHUSDT', [line]);
    saveDrawings(s, 'u', 'gone:ETHUSDT', [line]);
    saveDrawings(s, 'u', `${EXCHANGE_DRAWINGS}:BTCUSDT`, [line]);
    pruneDrawings(s, 'u', new Set(['keep']));
    expect([...s.data.keys()].sort()).toEqual(
      [drawingsKey('u', 'keep:ETHUSDT'), drawingsKey('u', `${EXCHANGE_DRAWINGS}:BTCUSDT`)].sort(),
    );
  });
});
