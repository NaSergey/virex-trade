import type { Features } from './report.types';
import {
  effectOf,
  learnRules,
  LearnTrade,
  quarterKey,
  rulesAt,
  topMistakes,
  walkForward,
} from './learning';

const FEAT: Features = {
  session: 'asia',
  weekend: 'no',
  daily: 'with',
  vol: 'mid',
  stopAtr: '0.5-1.5',
  plannedR: '2-3',
  pierce: '<0.25',
};
let seq = 0;
const trade = (
  rNet: number,
  ms: number,
  over: Partial<Features> = {},
): LearnTrade => ({
  id: String(seq++),
  fillMs: ms,
  exitMs: ms + 3_600_000,
  rNet,
  features: { ...FEAT, ...over },
});
const DAY = 86_400_000;
const Y2019 = Date.UTC(2019, 0, 1);
const winners = (n: number) =>
  Array.from({ length: n }, (_, i) => trade(0.5, Y2019 + i * DAY));

describe('learning', () => {
  it('learnRules — уверенно убыточная корзина становится правилом', () => {
    const train = [
      ...winners(70),
      ...Array.from({ length: 30 }, (_, i) =>
        trade(-1, Y2019 + i * DAY, { session: 'night' }),
      ),
    ];
    expect(learnRules(train)).toEqual([{ feature: 'session', value: 'night' }]);
  });

  it('learnRules — мало сделок или шум — правил нет', () => {
    const few = [
      ...winners(70),
      ...Array.from({ length: 15 }, (_, i) =>
        trade(-1, Y2019 + i * DAY, { session: 'night' }),
      ),
    ];
    expect(learnRules(few)).toEqual([]);
    const noisy = [
      ...winners(70),
      ...Array.from({ length: 30 }, (_, i) =>
        trade(i % 2 ? 0.9 : -1, Y2019 + i * DAY, { session: 'night' }),
      ),
    ];
    expect(learnRules(noisy)).toEqual([]);
  });

  it('learnRules — меньше 60 обучающих сделок — правил нет', () => {
    const train = Array.from({ length: 50 }, (_, i) =>
      trade(-1, Y2019 + i * DAY, { session: 'night' }),
    );
    expect(learnRules(train)).toEqual([]);
  });

  it('walkForward учит квартал только на сделках, закрытых до его начала', () => {
    const q1 = Date.UTC(2020, 0, 1);
    const trades = [
      ...winners(70),
      // Убыточные ночные — внутри 2020-Q1: в обучение Q1 не попадают, в Q2 — да.
      ...Array.from({ length: 30 }, (_, i) =>
        trade(-1, q1 + i * DAY, { session: 'night' }),
      ),
    ];
    const qs = walkForward(trades, q1, Date.UTC(2020, 6, 1));
    expect(qs.map((q) => q.key)).toEqual(['2020-Q1', '2020-Q2']);
    expect(qs[0].rules).toEqual([]);
    expect(qs[0].trainN).toBe(70);
    expect(qs[1].rules).toEqual([{ feature: 'session', value: 'night' }]);
    expect(qs[1].added).toEqual(qs[1].rules);
    expect(rulesAt(qs, Date.UTC(2020, 4, 1))).toEqual(qs[1].rules);
    expect(rulesAt(qs, Date.UTC(2019, 4, 1))).toBeNull();
  });

  it('сделка, закрытая после начала квартала, в его обучение не попадает', () => {
    const q2 = Date.UTC(2020, 3, 1);
    const straddle = {
      ...trade(-1, q2 - DAY, { session: 'night' }),
      exitMs: q2 + DAY,
    };
    const qs = walkForward([straddle], q2, q2 + DAY);
    expect(qs[0].trainN).toBe(0);
  });

  it('effectOf — вердикт по отсечённым вперёд сделкам', () => {
    const helped = Array.from({ length: 30 }, (_, i) => -1 + (i % 3) * 0.1);
    const hurt = Array.from({ length: 30 }, (_, i) => 1 - (i % 3) * 0.1);
    expect(effectOf(helped).verdict).toBe('helped');
    expect(effectOf(hurt).verdict).toBe('hurt');
    expect(effectOf([]).verdict).toBe('unproven');
    // На паре сделок интервал врёт — вердикта нет, хотя обе в минусе.
    expect(effectOf([-1, -1.1, -0.9]).verdict).toBe('unproven');
    expect(effectOf([-1, 1, -1, 1, 0.5, -0.5]).verdict).toBe('unproven');
  });

  it('topMistakes — худшие корзины по среднему R', () => {
    const trades = [
      ...Array.from({ length: 40 }, (_, i) => trade(0.4, Y2019 + i * DAY)),
      ...Array.from({ length: 25 }, (_, i) =>
        trade(-0.8, Y2019 + i * DAY, { vol: 'high' }),
      ),
    ];
    const [worst] = topMistakes(trades);
    expect(worst).toMatchObject({ feature: 'vol', value: 'high', n: 25 });
    expect(worst.mean).toBeCloseTo(-0.8);
  });

  it('quarterKey', () => {
    expect(quarterKey(Date.UTC(2021, 10, 5))).toBe('2021-Q4');
  });
});
