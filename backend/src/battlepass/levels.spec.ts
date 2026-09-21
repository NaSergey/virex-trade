import { MAX_LEVEL, REWARD_BASE } from './battlepass.config';
import { coinsBetween, ladder, levelFromXp, rewardCoins, xpForLevel, xpToAdvance } from './levels';

describe('levelFromXp', () => {
  it('пустой счёт — первый уровень, до второго сто XP', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpToNext: 100 });
  });

  it('ровно на границе уровень уже новый', () => {
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(99).level).toBe(1);
  });

  it('обратна xpForLevel на всём треке', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelFromXp(xpForLevel(level)).level).toBe(level);
      if (level > 1) expect(levelFromXp(xpForLevel(level) - 1).level).toBe(level - 1);
    }
  });

  it('выше потолка уровень не растёт, и идти больше некуда', () => {
    expect(levelFromXp(xpForLevel(MAX_LEVEL) + 1_000_000)).toEqual({
      level: MAX_LEVEL,
      xpIntoLevel: 0,
      xpToNext: 0,
    });
  });

  it('отрицательный и дробный XP не ломают счёт', () => {
    expect(levelFromXp(-5).level).toBe(1);
    expect(levelFromXp(150.7).level).toBe(2);
  });
});

describe('xpToAdvance', () => {
  it('каждый следующий переход дороже предыдущего на шаг', () => {
    expect(xpToAdvance(1)).toBe(100);
    expect(xpToAdvance(2)).toBe(120);
    expect(xpToAdvance(49)).toBe(1060);
  });
});

describe('rewardCoins', () => {
  it('ступень на каждую десятку уровней', () => {
    expect(rewardCoins(2)).toBe(REWARD_BASE);
    expect(rewardCoins(10)).toBe(REWARD_BASE);
    expect(rewardCoins(11)).toBe(REWARD_BASE * 2);
    expect(rewardCoins(MAX_LEVEL)).toBe(REWARD_BASE * 5);
  });
});

describe('coinsBetween', () => {
  it('складывает награды за уровни, которые ещё не забраны', () => {
    expect(coinsBetween(0, 3)).toBe(rewardCoins(2) + rewardCoins(3));
    expect(coinsBetween(2, 3)).toBe(rewardCoins(3));
  });

  it('за первый уровень награды нет — её не за что давать', () => {
    expect(coinsBetween(0, 1)).toBe(0);
  });

  it('забирать нечего, если забрано всё', () => {
    expect(coinsBetween(7, 7)).toBe(0);
    expect(coinsBetween(9, 7)).toBe(0);
  });
});

describe('ladder', () => {
  it('лестница начинается со второго уровня и кончается потолком', () => {
    const rows = ladder();
    expect(rows[0].level).toBe(2);
    expect(rows[rows.length - 1].level).toBe(MAX_LEVEL);
    expect(rows).toHaveLength(MAX_LEVEL - 1);
  });

  it('в строке стоит порог уровня, а не стоимость перехода', () => {
    expect(ladder()[0].xp).toBe(xpForLevel(2));
  });
});
