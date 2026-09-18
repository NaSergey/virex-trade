import { buildSeries } from './series';
import { syntheticProfile } from './market-stats';

// Грубые рамки «похоже на BTC». Точная подгонка — по скрипту
// synthetic-market-preview.ts; если рамка падает, правится params.ts, а не рамка.
const built = [11, 22, 33].map((seed) => buildSeries(seed));
const profiles = built.map(syntheticProfile);

describe('сгенерированный рынок похож на BTC', () => {
  it('суточная волатильность 1.5–6 %', () => {
    for (const p of profiles) {
      expect(p.dailyVol).toBeGreaterThan(0.015);
      expect(p.dailyVol).toBeLessThan(0.06);
    }
  });

  it('хвосты часовых доходностей тяжелее нормальных', () => {
    for (const p of profiles) expect(p.hourlyKurtosis).toBeGreaterThan(4);
  });

  it('волатильность идёт сериями', () => {
    for (const p of profiles) expect(p.absAutocorr[0]).toBeGreaterThan(0.1);
  });

  it('выходные тише будней', () => {
    for (const p of profiles) expect(p.weekendRatio).toBeLessThan(0.9);
  });

  it('за год встречаются все три режима', () => {
    for (const s of built) {
      expect(new Set(s.checkpoints.map((c) => c.regime.kind))).toEqual(new Set(['trend', 'range', 'squeeze']));
    }
  });

  it('цена не уходит от якоря дальше чем в четыре раза', () => {
    for (const s of built) {
      const closes = s.daily.map((d) => d.c);
      expect(Math.min(...closes)).toBeGreaterThan(s.axis.anchorPrice / 4);
      expect(Math.max(...closes)).toBeLessThan(s.axis.anchorPrice * 4);
    }
  });
});
