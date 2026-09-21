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
  it('карточные столы заведены, но пока не начисляют', () => {
    expect(XP_SOURCES['game.table'].enabled).toBe(false);
  });

  it('у фармящихся источников есть дневной потолок', () => {
    expect(XP_SOURCES['game.tournament'].dailyCap).toBe(1000);
    expect(XP_SOURCES['game.backtest'].dailyCap).toBe(300);
  });

  it('разметка тегом потолка не требует — её сторожит ключ по сделке', () => {
    expect(XP_SOURCES['journal.tag'].dailyCap).toBeNull();
  });
});
