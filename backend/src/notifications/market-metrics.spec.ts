import { WeekdayHourBucket } from '../market-events/market-events.service';
import {
  HourCandle,
  bookSpreadPct,
  fngHolds,
  hourAverages,
  hourMovePct,
  lsHolds,
  parseKline,
  peakHourOfWeekday,
  rangePct,
  rangeRatio,
  spreadRatio,
  topQuartileHours,
  weakWeekdays,
} from './market-metrics';

const candle = (o: number, h: number, l: number, c: number, t = 1e6): HourCandle => ({
  open: o,
  high: h,
  low: l,
  close: c,
  turnover: t,
});

describe('parseKline', () => {
  // Bybit отдаёт свечи строками и от новых к старым — обе особенности уже
  // приходилось учитывать в getVolatility, и обе легко забыть.
  it('переводит строки в числа и сортирует от старых к новым', () => {
    const raw = [
      ['1700003600000', '2', '3', '1', '2.5', '10', '100'],
      ['1700000000000', '1', '2', '0.5', '1.5', '10', '50'],
    ];
    const out = parseKline(raw);
    expect(out).toHaveLength(2);
    expect(out[0].open).toBe(1);
    expect(out[1].open).toBe(2);
    expect(out[1].turnover).toBe(100);
  });

  it('пустой ответ даёт пустой список, а не исключение', () => {
    expect(parseKline(undefined)).toEqual([]);
  });
});

describe('hourMovePct', () => {
  it('считает модуль изменения свечи', () => {
    expect(hourMovePct(candle(100, 105, 99, 103))).toBeCloseTo(3);
    expect(hourMovePct(candle(100, 105, 95, 97))).toBeCloseTo(3);
  });

  it('нулевой open даёт 0, а не Infinity', () => {
    expect(hourMovePct(candle(0, 1, 0, 1))).toBe(0);
  });
});

describe('rangeRatio', () => {
  it('делит размах свечи на средний размах базы', () => {
    // Свеча: (110−100)/100 = 10%. База: две по 2% и 4% → среднее 3%.
    const base = [candle(100, 102, 100, 101), candle(100, 104, 100, 103)];
    expect(rangeRatio(candle(100, 110, 100, 105), base)).toBeCloseTo(10 / 3);
  });

  it('пустая база даёт null — сравнивать не с чем', () => {
    expect(rangeRatio(candle(100, 110, 100, 105), [])).toBeNull();
  });

  it('rangePct считает размах, а не направление', () => {
    // Свеча с длинными тенями и нулевым телом всё равно волатильна.
    expect(rangePct(candle(100, 106, 96, 100))).toBeCloseTo(10);
  });
});

describe('bookSpreadPct и spreadRatio', () => {
  it('раздвижка — разность центров сторон, нормированная ценой', () => {
    expect(bookSpreadPct({ price: 100, bidCenter: 99, askCenter: 101 })).toBeCloseTo(2);
  });

  it('spreadRatio сравнивает со средней по базе', () => {
    const base = [
      { price: 100, bidCenter: 99.5, askCenter: 100.5 },
      { price: 100, bidCenter: 99.5, askCenter: 100.5 },
    ];
    expect(spreadRatio({ price: 100, bidCenter: 99, askCenter: 101 }, base)).toBeCloseTo(2);
  });

  it('нулевая база даёт null, а не Infinity', () => {
    const base = [{ price: 100, bidCenter: 100, askCenter: 100 }];
    expect(spreadRatio({ price: 100, bidCenter: 99, askCenter: 101 }, base)).toBeNull();
  });
});

describe('fngHolds', () => {
  // value пресета — нижняя граница, верхняя симметрична: 25 → 25/75.
  it('срабатывает на обоих концах', () => {
    expect(fngHolds(20, 25)).toBe(true);
    expect(fngHolds(80, 25)).toBe(true);
  });

  it('в середине не срабатывает', () => {
    expect(fngHolds(50, 25)).toBe(false);
  });

  it('на самой границе срабатывает', () => {
    expect(fngHolds(25, 25)).toBe(true);
    expect(fngHolds(75, 25)).toBe(true);
  });
});

describe('lsHolds', () => {
  it('срабатывает на перекосе в любую сторону', () => {
    expect(lsHolds(72, 70)).toBe(true);
    expect(lsHolds(28, 70)).toBe(true);
    expect(lsHolds(55, 70)).toBe(false);
  });
});

describe('topQuartileHours', () => {
  it('отбирает четверть часов с наибольшей волатильностью', () => {
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      samples: 100,
      winRateLongPct: 50,
      avgChangePct: 0,
      avgVolatilityPct: hour, // 0..23, верхняя четверть — 18..23
    }));
    const top = topQuartileHours(hourly);
    expect(top).toHaveLength(6);
    expect(top).toContain(23);
    expect(top).not.toContain(17);
  });

  // Часы без данных нельзя объявлять спокойными: их просто нечем оценить.
  it('часы без выборки не попадают в отбор', () => {
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      samples: hour === 23 ? 0 : 100,
      winRateLongPct: 50,
      avgChangePct: 0,
      avgVolatilityPct: hour,
    }));
    expect(topQuartileHours(hourly)).not.toContain(23);
  });
});

describe('weakWeekdays', () => {
  it('отбирает дни с винрейтом лонга ниже 50%', () => {
    const weekday = Array.from({ length: 7 }, (_, wd) => ({
      weekday: wd,
      days: 100,
      upDays: 50,
      winRateLongPct: wd === 2 ? 44 : 52,
      avgChangePct: 0,
    }));
    expect(weakWeekdays(weekday)).toEqual([2]);
  });

  it('день без выборки не считается слабым', () => {
    const weekday = Array.from({ length: 7 }, (_, wd) => ({
      weekday: wd,
      days: wd === 3 ? 0 : 100,
      upDays: 0,
      winRateLongPct: 0,
      avgChangePct: 0,
    }));
    expect(weakWeekdays(weekday)).not.toContain(3);
  });
});

describe('hourAverages', () => {
  it('усредняет день недели по часу с весом выборки', () => {
    const cells = [
      { weekday: 0, hour: 5, samples: 100, avgVolatilityPct: 1 },
      { weekday: 1, hour: 5, samples: 300, avgVolatilityPct: 2 },
    ];
    const [h5] = hourAverages(cells);
    expect(h5.hour).toBe(5);
    expect(h5.samples).toBe(400);
    // Не 1.5: у второго дня втрое больше свечей.
    expect(h5.avgVolatilityPct).toBeCloseTo(1.75, 6);
  });
});

/**
 * Ровная неделя: волатильность зависит только от часа, дни между собой не
 * различаются. Тесты подкручивают в ней отдельные клетки.
 */
const flatCells = (): WeekdayHourBucket[] => {
  const cells: WeekdayHourBucket[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ weekday, hour, samples: 100, avgVolatilityPct: 0.2 + hour * 0.05 });
    }
  }
  return cells;
};

const cellAt = (cells: WeekdayHourBucket[], weekday: number, hour: number): WeekdayHourBucket =>
  cells.find((c) => c.weekday === weekday && c.hour === hour)!;

describe('peakHourOfWeekday', () => {
  it('на ровной неделе не зовёт никуда: дня-победителя нет', () => {
    expect(peakHourOfWeekday(flatCells(), 3, 1.1)).toBeNull();
  });

  it('находит день, в который час заметно живее остальных', () => {
    const cells = flatCells();
    cellAt(cells, 5, 20).avgVolatilityPct = 2;

    const pick = peakHourOfWeekday(cells, 5, 1.1);
    expect(pick?.hour).toBe(20);
    expect(pick?.weekday).toBe(5);
    expect(pick?.ratio).toBeGreaterThan(1.5);
    // Тот же час в другие дни — не повод: победитель ровно один.
    expect(peakHourOfWeekday(cells, 4, 1.1)).toBeNull();
  });

  it('в сутках отдаёт один час, самый волатильный из прошедших отбор', () => {
    const cells = flatCells();
    cellAt(cells, 2, 19).avgVolatilityPct = 1.5;
    cellAt(cells, 2, 23).avgVolatilityPct = 2;

    expect(peakHourOfWeekday(cells, 2, 1.1)?.hour).toBe(23);
  });

  it('не зовёт в тихий час, даже если день в нём лучший из семи', () => {
    const cells = flatCells();
    // Час 0 — самый спокойный в сутках; удвоение оставляет его таким же.
    cellAt(cells, 1, 0).avgVolatilityPct = 0.4;

    expect(peakHourOfWeekday(cells, 1, 1.1)).toBeNull();
  });

  it('порог отсекает превышение, которое ничего не значит', () => {
    const cells = flatCells();
    cellAt(cells, 6, 22).avgVolatilityPct = 1.4; // ≈×1.07 к среднему по неделе

    expect(peakHourOfWeekday(cells, 6, 1.05)?.hour).toBe(22);
    expect(peakHourOfWeekday(cells, 6, 1.2)).toBeNull();
  });

  it('час с неполной неделей данных не рассматривается', () => {
    const cells = flatCells();
    cellAt(cells, 6, 22).avgVolatilityPct = 2;
    // У четверга в этом часе выборки почти нет — значит, назвать субботу
    // самым волатильным днём этого часа нечем.
    cellAt(cells, 4, 22).samples = 3;

    expect(peakHourOfWeekday(cells, 6, 1.1)).toBeNull();
  });
});
