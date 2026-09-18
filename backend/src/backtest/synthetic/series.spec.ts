import { DAY_MS, MINUTE_MS, SYNTH_EPOCH } from './params';
import { cloneState, type Bar } from './model';
import { BucketFold, axisFor, buildSeries, querySeries, simulateDay, startOf, type Series } from './series';

// Прогон оси — десятые доли секунды: одна ось на файл, а не на тест.
const SEED = 20260914;
let series: Series;
beforeAll(() => {
  series = buildSeries(SEED);
});

const fold = (bars: Bar[], tfMs: number) => {
  const f = new BucketFold(tfMs);
  bars.forEach((b) => f.push(b));
  return f.out;
};

describe('ось сессии', () => {
  it('старт через 366 суток после эпохи, в первую неделю, на границе минуты; 30 суток вперёд', () => {
    const { start, end, days } = series.axis;
    expect(start - SYNTH_EPOCH).toBeGreaterThanOrEqual(366 * DAY_MS);
    expect(start - SYNTH_EPOCH).toBeLessThan(373 * DAY_MS);
    expect(start % MINUTE_MS).toBe(0);
    expect(end - start).toBe(30 * DAY_MS);
    expect(series.daily).toHaveLength(days);
    expect(series.checkpoints).toHaveLength(days + 1);
  });

  it('разные зёрна — разные оси', () => {
    expect(axisFor(1).anchorPrice).not.toBe(axisFor(2).anchorPrice);
  });
});

describe('детерминизм', () => {
  it('то же зерно — те же свечи', () => {
    const again = buildSeries(SEED);
    const q = { timeframe: 1, from: series.axis.start - DAY_MS, limit: 3000 };
    expect(querySeries(again, q)).toEqual(querySeries(series, q));
    expect(again.daily).toEqual(series.daily);
  });

  it('другое зерно — другие свечи', () => {
    expect(buildSeries(SEED + 1).daily.map((d) => d.c)).not.toEqual(series.daily.map((d) => d.c));
  });

  it('сутки с контрольной точки приводят ровно к следующей точке', () => {
    for (const d of [0, 200, series.axis.days - 2]) {
      const state = cloneState(series.checkpoints[d]);
      simulateDay(state, SEED, d, () => undefined);
      expect(state).toEqual(series.checkpoints[d + 1]);
    }
  });
});

describe('куски без шва', () => {
  it('минутки вперёд кусками равны одному запросу', () => {
    const from = series.axis.start - DAY_MS;
    const whole = querySeries(series, { timeframe: 1, from, limit: 12_000 });
    const a = querySeries(series, { timeframe: 1, from, limit: 5000 });
    const b = querySeries(series, { timeframe: 1, from: a[a.length - 1].t + MINUTE_MS, limit: 5000 });
    const c = querySeries(series, { timeframe: 1, from: b[b.length - 1].t + MINUTE_MS, limit: 2000 });
    expect([...a, ...b, ...c]).toEqual(whole);
  });

  it('история назад кусками равна одному запросу', () => {
    const to = series.axis.start - 1;
    const whole = querySeries(series, { timeframe: 240, to, limit: 800 });
    const late = querySeries(series, { timeframe: 240, to, limit: 300 });
    const early = querySeries(series, { timeframe: 240, to: late[0].t - 1, limit: 500 });
    expect([...early, ...late]).toEqual(whole);
  });

  it('дневка из прогона равна свёртке минуток тех же суток', () => {
    const t = SYNTH_EPOCH + 100 * DAY_MS;
    const minutes = querySeries(series, { timeframe: 1, from: t, limit: 1440 });
    expect(querySeries(series, { timeframe: 1440, from: t, limit: 1 })).toEqual(fold(minutes, DAY_MS));
  });

  it('часовые свечи равны свёртке минуток', () => {
    const t = SYNTH_EPOCH + 50 * DAY_MS;
    const minutes = querySeries(series, { timeframe: 1, from: t, limit: 2 * 1440 });
    expect(querySeries(series, { timeframe: 60, from: t, limit: 48 })).toEqual(fold(minutes, 60 * MINUTE_MS));
  });
});

describe('минутки', () => {
  const bars = () => querySeries(series, { timeframe: 1, from: series.axis.start - 3 * DAY_MS, limit: 6 * 1440 });
  const onTick = (x: number) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-6;

  it('OHLC согласованы, цена положительна и кратна 0.1', () => {
    const bad = bars().filter(
      (b) =>
        !(b.l <= Math.min(b.o, b.c) && b.h >= Math.max(b.o, b.c) && b.l > 0 && [b.o, b.h, b.l, b.c].every(onTick)),
    );
    expect(bad).toEqual([]);
  });

  it('открытие — закрытие предыдущей минутки, без дыр во времени', () => {
    const xs = bars();
    const bad = xs.slice(1).filter((b, i) => b.o !== xs[i].c || b.t - xs[i].t !== MINUTE_MS);
    expect(bad).toEqual([]);
  });
});

describe('запрос', () => {
  it('без from — последние limit свечей до to включительно, по возрастанию', () => {
    const to = series.axis.start - MINUTE_MS;
    expect(querySeries(series, { timeframe: 1, to, limit: 3 }).map((b) => b.t)).toEqual([
      to - 2 * MINUTE_MS,
      to - MINUTE_MS,
      to,
    ]);
  });

  it('from округляется вверх до границы свечи', () => {
    const t = SYNTH_EPOCH + 30 * DAY_MS;
    expect(querySeries(series, { timeframe: 60, from: t + 1, limit: 1 })[0].t).toBe(t + 3_600_000);
  });

  it('раньше эпохи и после конца свечей нет', () => {
    expect(querySeries(series, { timeframe: 60, to: SYNTH_EPOCH - 1, limit: 10 })).toEqual([]);
    expect(querySeries(series, { timeframe: 1, from: SYNTH_EPOCH - DAY_MS, limit: 1 })[0].t).toBe(SYNTH_EPOCH);
    const { end } = series.axis;
    expect(querySeries(series, { timeframe: 1, from: end - 2 * MINUTE_MS, limit: 10 }).map((b) => b.t)).toEqual([
      end - 2 * MINUTE_MS,
      end - MINUTE_MS,
    ]);
  });

  it('последняя дневка кончается последней минуткой сессии', () => {
    const [lastDay] = querySeries(series, { timeframe: 1440, limit: 1 });
    const [lastMinute] = querySeries(series, { timeframe: 1, limit: 1 });
    expect(lastDay.t).toBe(Math.floor((series.axis.end - 1) / DAY_MS) * DAY_MS);
    expect(lastDay.c).toBe(lastMinute.c);
  });

  it('цена старта — закрытие минутки перед стартом', () => {
    const { start, price } = startOf(series);
    expect(start).toBe(series.axis.start);
    expect(price).toBe(querySeries(series, { timeframe: 1, to: start - MINUTE_MS, limit: 1 })[0].c);
  });
});
