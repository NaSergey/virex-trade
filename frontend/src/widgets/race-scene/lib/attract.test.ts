import { describe, expect, it } from 'vitest';
import { createAttract } from './attract';

describe('createAttract', () => {
  it('гонка ботов идёт сама и после конца начинается заново на новой трассе', () => {
    const src = createAttract();
    const first = src.next(0.1)!;
    expect(first.cars).toHaveLength(3);
    let course = first.course;
    let restarted = false;
    let t = first.t;
    for (let i = 0; i < 3000 && !restarted; i++) {
      const f = src.next(0.1)!;
      if (f.course !== course) restarted = true;
      else expect(f.t).toBeGreaterThanOrEqual(t);
      t = f.t;
      course = f.course;
    }
    expect(restarted).toBe(true);
  });
});
