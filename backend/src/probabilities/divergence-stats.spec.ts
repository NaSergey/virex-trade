import { readFileSync } from 'fs';
import { join } from 'path';
import { divergenceOdds } from './divergence-stats';
import { divergenceEventsOf } from './rsi';

const fixture = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '../../../frontend/src/widgets/backtest-session/lib/__fixtures__/btc-4h-2024.json',
    ),
    'utf8',
  ),
) as number[][];
const bars = fixture.map(([t, , h, l, c]) => ({ t, h, l, c }));

describe('divergenceOdds', () => {
  it('2024 год целиком — в проверке, история пуста', () => {
    const odds = divergenceOdds(bars);
    for (const s of [odds.bull, odds.bear]) {
      if (!s) continue;
      expect(s.train.n).toBe(0);
      expect(s.holds).toBe(false);
    }
  });

  it('стороны — по смыслу дивергенции, исходов не больше событий', () => {
    const odds = divergenceOdds(bars);
    const events = divergenceEventsOf(bars);
    expect(odds.bull?.side ?? 'up').toBe('up');
    expect(odds.bear?.side ?? 'down').toBe('down');
    const n = (odds.bull?.test.n ?? 0) + (odds.bear?.test.n ?? 0);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(events.length);
  });

  it('пустой ряд — без частот', () => {
    expect(divergenceOdds([])).toEqual({ bull: null, bear: null });
  });
});
