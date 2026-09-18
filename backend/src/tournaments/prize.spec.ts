import { payouts, prizePool, validateShares } from './prize';

/**
 * Призовой фонд — чужие монеты, и раздать их нужно без остатка: недоданная
 * монета копится у проекта, лишняя берётся из ниоткуда. Проверяется ровно это
 * равенство и правила долей, которые задаёт создатель турнира.
 */
describe('prizePool', () => {
  it('складывает взносы всех участников и добавку создателя', () => {
    expect(prizePool({ entryFee: 100, prizeBonus: 500 }, 4)).toBe(900);
  });

  it('бесплатный турнир без добавки даёт нулевой фонд', () => {
    expect(prizePool({ entryFee: 0, prizeBonus: 0 }, 10)).toBe(0);
  });
});

describe('payouts', () => {
  it('один победитель забирает фонд целиком', () => {
    expect(payouts(900, [100])).toEqual([900]);
  });

  it('делит по долям', () => {
    expect(payouts(1000, [70, 30])).toEqual([700, 300]);
  });

  it('остаток округления достаётся первому месту — фонд расходится без хвоста', () => {
    const shares = [50, 30, 20];
    const pool = 1001;
    const result = payouts(pool, shares);

    // 500.5 / 300.3 / 200.2 вниз — это 500 + 300 + 200 = 1000, одна монета лишняя.
    expect(result).toEqual([501, 300, 200]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(pool);
  });

  it('нулевой фонд не выплачивает ничего', () => {
    expect(payouts(0, [70, 30])).toEqual([0, 0]);
  });
});

describe('validateShares', () => {
  it('принимает доли, которые в сумме дают сто и не возрастают', () => {
    expect(validateShares([100], 1)).toBe(true);
    expect(validateShares([70, 30], 2)).toBe(true);
    expect(validateShares([50, 30, 20], 3)).toBe(true);
    // Поровну — тоже не возрастают.
    expect(validateShares([50, 50], 2)).toBe(true);
  });

  it('длина обязана совпадать с числом победителей', () => {
    expect(validateShares([70, 30], 3)).toBe(false);
    expect(validateShares([100], 2)).toBe(false);
  });

  it('сумма не сто — отказ', () => {
    expect(validateShares([70, 20], 2)).toBe(false);
    expect(validateShares([80, 30], 2)).toBe(false);
  });

  it('второе место не может получить больше первого', () => {
    expect(validateShares([30, 70], 2)).toBe(false);
  });

  it('нулевая и дробная доля — отказ: место в призах без приза бессмысленно', () => {
    expect(validateShares([100, 0], 2)).toBe(false);
    expect(validateShares([99.5, 0.5], 2)).toBe(false);
  });
});
