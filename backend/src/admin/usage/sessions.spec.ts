import {
  DAY_MS,
  floorToDay,
  floorToMinute,
  floorToWeek,
  median,
  round,
} from './sessions';

describe('floorToMinute', () => {
  it('обрезает секунды', () => {
    expect(
      floorToMinute(new Date('2026-09-01T10:07:42.500Z')).toISOString(),
    ).toBe('2026-09-01T10:07:00.000Z');
  });
});

describe('floorToDay', () => {
  it('в UTC режет по полуночи UTC', () => {
    expect(floorToDay(new Date('2026-09-01T23:59:00Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  it('со сдвигом +180 вечер москвича остаётся в его же сутках', () => {
    // 20:30 UTC — это 23:30 первого сентября по Москве, а московские сутки
    // первого сентября начинаются в 21:00 UTC тридцать первого августа.
    const day = floorToDay(new Date('2026-09-01T20:30:00Z'), 180);
    expect(day.toISOString()).toBe('2026-08-31T21:00:00.000Z');
  });

  it('со сдвигом +180 ночь после полуночи UTC — всё ещё прошедший день', () => {
    const day = floorToDay(new Date('2026-09-02T00:30:00Z'), 180);
    expect(day.toISOString()).toBe('2026-09-01T21:00:00.000Z');
  });
});

describe('floorToWeek', () => {
  it('неделя начинается с понедельника', () => {
    // 2026-09-01 — вторник.
    expect(floorToWeek(new Date('2026-09-01T12:00:00Z')).toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    );
  });

  it('воскресенье относится к уходящей неделе, а не к новой', () => {
    expect(floorToWeek(new Date('2026-09-06T23:00:00Z')).toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    );
  });

  it('ровно понедельник остаётся собой', () => {
    const monday = new Date('2026-08-31T00:00:00Z');
    expect(floorToWeek(monday).getTime()).toBe(monday.getTime());
  });

  it('со сдвигом часового пояса шаг остаётся ровно неделей', () => {
    const a = floorToWeek(new Date('2026-09-01T12:00:00Z'), 180);
    const b = floorToWeek(new Date('2026-09-08T12:00:00Z'), 180);
    expect(b.getTime() - a.getTime()).toBe(7 * DAY_MS);
  });
});

describe('median', () => {
  it('не даёт одной забытой вкладке определять типичную сессию', () => {
    // Среднее здесь 63, медиана 3 — и вторая честнее описывает эту выборку.
    expect(median([2, 3, 4, 5, 300])).toBe(4);
    expect(median([2, 4])).toBe(3);
  });

  it('пустая выборка — ноль, а не NaN', () => {
    expect(median([])).toBe(0);
  });
});

describe('round', () => {
  it('округляет до заданного знака', () => {
    expect(round(1.26)).toBe(1.3);
    expect(round(0.0333, 2)).toBe(0.03);
  });
});
