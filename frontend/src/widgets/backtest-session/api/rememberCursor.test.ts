import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { backtestSessionQuery, rememberCursor } from './hooks';
import type { SessionDetail } from './types';

const T0 = Date.UTC(2025, 8, 8, 2, 0);
const detail = { session: { id: 's1', cursorTime: new Date(T0).toISOString() } } as unknown as SessionDetail;

describe('rememberCursor — момент прокрутки в кэше сессии', () => {
  it('вернувшийся в сессию монтирует прокрутку с последнего сохранённого момента', () => {
    const qc = new QueryClient();
    qc.setQueryData(backtestSessionQuery('s1').queryKey, detail);
    rememberCursor(qc, 's1', T0 + 37 * 60_000);
    expect(qc.getQueryData(backtestSessionQuery('s1').queryKey)?.session.cursorTime).toBe(new Date(T0 + 37 * 60_000).toISOString());
  });

  it('назад не двигает — как и сервер', () => {
    const qc = new QueryClient();
    qc.setQueryData(backtestSessionQuery('s1').queryKey, detail);
    rememberCursor(qc, 's1', T0 - 60_000);
    expect(qc.getQueryData(backtestSessionQuery('s1').queryKey)?.session.cursorTime).toBe(new Date(T0).toISOString());
  });

  it('сессии нет в кэше — ничего не заводит', () => {
    const qc = new QueryClient();
    rememberCursor(qc, 's1', T0);
    expect(qc.getQueryData(backtestSessionQuery('s1').queryKey)).toBeUndefined();
  });
});
