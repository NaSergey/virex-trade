import type { Response } from 'express';
import { MarketDataController } from './market-data.controller';

/**
 * T19: дефолт лимита при отсутствии `limit` снижен до 500 (`MAX_LIMIT` = 5000
 * остаётся потолком явного запроса — реплей бектеста берёт им куски по 5000);
 * `Cache-Control: public, max-age=86400, immutable` ставится только для окна,
 * чья правая граница (`to`) целиком в прошлом — свечи такого окна больше не
 * изменятся, в отличие от текущей/последней свечи, которая ещё формируется.
 *
 * Время зафиксировано `jest.useFakeTimers()`, иначе тест на границу
 * «to === сейчас» был бы недетерминирован: между чтением `Date.now()` в тесте
 * и сравнением внутри контроллера реальные часы успевают уйти вперёд.
 */

function fakeRes() {
  const headers: Record<string, string> = {};
  const res: Partial<Response> = {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
      return res as Response;
    }) as unknown as Response['setHeader'],
  };
  return { res: res as Response, headers };
}

function makeController(candles: unknown[] = []) {
  const getCandles = jest.fn().mockResolvedValue(candles);
  const marketData = { getCandles, getCoverage: jest.fn() };
  // Эфирный хвост в этих тестах не участвует — эндпоинт `live` здесь не проверяется.
  const controller = new MarketDataController(marketData as never, {} as never);
  return { controller, getCandles };
}

const NOW = new Date('2026-01-05T00:00:00.000Z');

describe('MarketDataController.getCandles (T19)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('без limit в запросе просит у сервиса дефолт 500, а не MAX_LIMIT', async () => {
    const { controller, getCandles } = makeController();
    const { res } = fakeRes();

    await controller.getCandles(
      '60',
      undefined,
      undefined,
      undefined,
      undefined,
      res,
    );

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
  });

  it('явный limit выше потолка всё ещё режется MAX_LIMIT=5000, не новым дефолтом', async () => {
    const { controller, getCandles } = makeController();
    const { res } = fakeRes();

    await controller.getCandles(
      '60',
      undefined,
      undefined,
      undefined,
      '999999',
      res,
    );

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5000 }),
    );
  });

  it('явный limit=5000 (кусок реплея бектеста) уходит в сервис как есть', async () => {
    const { controller, getCandles } = makeController();
    const { res } = fakeRes();

    await controller.getCandles(
      '1',
      undefined,
      undefined,
      undefined,
      '5000',
      res,
    );

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5000 }),
    );
  });

  it('явный limit меньше дефолта передаётся как есть, не поднимается до 500', async () => {
    const { controller, getCandles } = makeController();
    const { res } = fakeRes();

    await controller.getCandles(
      '60',
      undefined,
      undefined,
      undefined,
      '10',
      res,
    );

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('to строго раньше сейчас — окно целиком в прошлом, ставит Cache-Control immutable', async () => {
    const { controller } = makeController();
    const { res, headers } = fakeRes();
    const to = String(NOW.getTime() - 60_000);

    await controller.getCandles('60', undefined, undefined, to, undefined, res);

    expect(headers['Cache-Control']).toBe('public, max-age=86400, immutable');
  });

  it('to не задан — верхняя граница «сейчас» (текущая свеча ещё формируется), без Cache-Control', async () => {
    const { controller } = makeController();
    const { res, headers } = fakeRes();

    await controller.getCandles(
      '60',
      undefined,
      undefined,
      undefined,
      undefined,
      res,
    );

    expect(headers['Cache-Control']).toBeUndefined();
  });

  it('to равен текущему моменту ровно — граница ещё не «раньше», без Cache-Control', async () => {
    const { controller } = makeController();
    const { res, headers } = fakeRes();

    await controller.getCandles(
      '60',
      undefined,
      undefined,
      String(NOW.getTime()),
      undefined,
      res,
    );

    expect(headers['Cache-Control']).toBeUndefined();
  });

  it('to в будущем относительно сейчас — без Cache-Control', async () => {
    const { controller } = makeController();
    const { res, headers } = fakeRes();
    const to = String(NOW.getTime() + 60_000);

    await controller.getCandles('60', undefined, undefined, to, undefined, res);

    expect(headers['Cache-Control']).toBeUndefined();
  });

  it('from без to — окно открыто в сторону настоящего, без Cache-Control', async () => {
    const { controller } = makeController();
    const { res, headers } = fakeRes();
    const from = String(NOW.getTime() - 3_600_000);

    await controller.getCandles(
      '60',
      undefined,
      from,
      undefined,
      undefined,
      res,
    );

    expect(headers['Cache-Control']).toBeUndefined();
  });
});
