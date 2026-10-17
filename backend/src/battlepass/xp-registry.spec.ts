import { tournamentXp, XP_SOURCES } from './xp-registry';

describe('tournamentXp', () => {
  it('база плюс надбавка за каждого обойдённого соперника', () => {
    expect(tournamentXp(10, 1)).toBe(100 + 25 * 9);
    expect(tournamentXp(10, 10)).toBe(100);
    expect(tournamentXp(2, 2)).toBe(100);
  });

  it('место вне состава не уводит начисление ниже базы', () => {
    expect(tournamentXp(2, 5)).toBe(100);
  });
});

describe('XP_SOURCES', () => {
  it('опыт — за действия человека: позиция, партия, ставка, свои теги', () => {
    expect(XP_SOURCES['trade.open']).toMatchObject({ enabled: true, base: 10, dailyCap: 200 });
    expect(XP_SOURCES['game.table']).toMatchObject({ enabled: true, base: 5, dailyCap: 150 });
    expect(XP_SOURCES['game.jetpack']).toMatchObject({ enabled: true, base: 5, dailyCap: 100 });
    expect(XP_SOURCES['journal.setup']).toMatchObject({ enabled: true, base: 10, dailyCap: 50 });
  });

  it('у каждого источника с опытом есть дневной потолок', () => {
    for (const def of Object.values(XP_SOURCES)) {
      if (def.enabled && def.base > 0) expect(def.dailyCap).not.toBeNull();
    }
  });

  it('за сессию бектеста и разметку сделки опыта нет (владелец 2026-10-17)', () => {
    expect(XP_SOURCES['game.backtest'].enabled).toBe(false);
    expect(XP_SOURCES['journal.tag'].base).toBe(0);
  });
});
