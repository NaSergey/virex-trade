import { describe, expect, it } from 'vitest';
import { countdown } from './countdown';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

describe('countdown', () => {
  it('меньше часа — минуты и секунды', () => {
    expect(countdown(14 * M + 33 * S)).toBe('14:33');
  });

  it('больше часа — часы, минуты, секунды', () => {
    expect(countdown(3 * H + 14 * M + 33 * S)).toBe('03:14:33');
  });

  it('больше суток — дни отдельно: слово переводит компонент', () => {
    expect(countdown(2 * D + 3 * H + 14 * M + 33 * S)).toEqual({ days: 2, clock: '03:14:33' });
  });

  it('доля секунды округляется вверх: «00:00» при ещё не наступившем старте не показывается', () => {
    expect(countdown(200)).toBe('00:01');
  });

  it('ноль и прошлое — отсчёта нет', () => {
    expect(countdown(0)).toBeNull();
    expect(countdown(-5 * S)).toBeNull();
  });
});
