import { crossed, followTarget } from './follow-rule';

describe('followTarget — правило бектеста', () => {
  it('первый тейк — стоп в безубыток, следующий — на предыдущий тейк', () => {
    expect(followTarget('long', 60_000, [61_000], 59_000)).toBe(60_000);
    expect(followTarget('long', 60_000, [61_000, 62_000], 60_000)).toBe(61_000);
    expect(followTarget('short', 60_000, [59_000], 61_000)).toBe(60_000);
    expect(followTarget('short', 60_000, [59_000, 58_000], 60_000)).toBe(59_000);
  });

  it('стопа нет — любая цель теснее', () => {
    expect(followTarget('long', 60_000, [61_000], null)).toBe(60_000);
    expect(followTarget('long', 60_000, [61_000], 0)).toBe(60_000);
  });

  it('не теснее ручного стопа — не ставится', () => {
    expect(followTarget('long', 60_000, [61_000], 60_500)).toBeNull();
    expect(followTarget('short', 60_000, [59_000], 59_500)).toBeNull();
  });

  it('тейки исполнились не по порядку: цель не по свою сторону от цены исполнения — не ставится', () => {
    // лонг: второй исполненный ниже первого — стоп 62 000 оказался бы над ценой 61 500.
    expect(followTarget('long', 60_000, [62_000, 61_500], 60_000)).toBeNull();
  });

  it('ничего не исполнено — цели нет', () => {
    expect(followTarget('long', 60_000, [], null)).toBeNull();
  });
});

describe('crossed', () => {
  it('лонг: цена на стопе или ниже; шорт: на стопе или выше', () => {
    expect(crossed('long', 60_000, 60_000)).toBe(true);
    expect(crossed('long', 60_001, 60_000)).toBe(false);
    expect(crossed('short', 60_000, 60_000)).toBe(true);
    expect(crossed('short', 59_999, 60_000)).toBe(false);
  });
});
