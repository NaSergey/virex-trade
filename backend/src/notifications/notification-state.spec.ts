import { decide } from './notification-state';

const HOUR = 3_600_000;
const T0 = new Date('2026-09-03T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('decide', () => {
  it('условие не держится — не шлём и гасим фронт', () => {
    expect(decide({ activeSince: T0, lastSentAt: T0 }, false, at(HOUR), 2 * HOUR)).toEqual({
      send: false,
      activeSince: null,
    });
  });

  it('первый раз держится — шлём', () => {
    expect(decide(null, true, T0, 2 * HOUR)).toEqual({ send: true, activeSince: T0 });
  });

  // Метрика может держаться выше порога сутками. Сигнал — про событие
  // «стало», а не про состояние «есть».
  it('держится второй тик подряд — молчим', () => {
    expect(decide({ activeSince: T0, lastSentAt: T0 }, true, at(5 * 60_000), 2 * HOUR)).toEqual({
      send: false,
      activeSince: T0,
    });
  });

  // Дребезг у самого порога: метрика прыгает туда-сюда каждые пять минут, и
  // без cooldown каждый прыжок был бы новым событием.
  it('новый фронт внутри cooldown — молчим, но фронт отмечаем', () => {
    const t = at(30 * 60_000);
    expect(decide({ activeSince: null, lastSentAt: T0 }, true, t, 2 * HOUR)).toEqual({
      send: false,
      activeSince: t,
    });
  });

  it('новый фронт после cooldown — шлём', () => {
    const t = at(3 * HOUR);
    expect(decide({ activeSince: null, lastSentAt: T0 }, true, t, 2 * HOUR)).toEqual({
      send: true,
      activeSince: t,
    });
  });

  it('нулевой cooldown не мешает следующему фронту', () => {
    const t = at(60_000);
    expect(decide({ activeSince: null, lastSentAt: T0 }, true, t, 0)).toEqual({
      send: true,
      activeSince: t,
    });
  });
});
