import { DAILY_REWARD_COINS } from './battlepass.config';
import { dailyState, dayKey, recentDayKeys, startOfUtcDay } from './daily';

const TODAY = new Date('2026-09-21T10:00:00Z');
const days = (...keys: string[]) => new Set(keys);

describe('dayKey', () => {
  it('дата UTC, без времени', () => {
    expect(dayKey(new Date('2026-09-21T23:59:59Z'))).toBe('2026-09-21');
  });
});

describe('startOfUtcDay', () => {
  it('срезает время до полуночи UTC', () => {
    expect(startOfUtcDay(TODAY).toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });
});

describe('recentDayKeys', () => {
  it('восемь дат: сегодня и семь предыдущих', () => {
    const keys = recentDayKeys(TODAY);
    expect(keys).toHaveLength(8);
    expect(keys[0]).toBe('2026-09-21');
    expect(keys[7]).toBe('2026-09-14');
  });
});

describe('dailyState', () => {
  it('первый заход: день первый, награда не забрана', () => {
    expect(dailyState(days(), TODAY)).toEqual({
      day: 1,
      streak: 0,
      claimedToday: false,
      coins: DAILY_REWARD_COINS[0],
      nextCoins: DAILY_REWARD_COINS[1],
      week: [...DAILY_REWARD_COINS],
    });
  });

  it('забрал сегодня — стрик считает и сегодняшний день', () => {
    const state = dailyState(days('2026-09-21'), TODAY);
    expect(state.claimedToday).toBe(true);
    expect(state.day).toBe(1);
    expect(state.streak).toBe(1);
  });

  it('три дня подряд до сегодня — сегодня четвёртый', () => {
    const state = dailyState(days('2026-09-20', '2026-09-19', '2026-09-18'), TODAY);
    expect(state.day).toBe(4);
    expect(state.coins).toBe(DAILY_REWARD_COINS[3]);
    expect(state.claimedToday).toBe(false);
  });

  it('пропущенный день возвращает к первому', () => {
    const state = dailyState(days('2026-09-19', '2026-09-18'), TODAY);
    expect(state.day).toBe(1);
    expect(state.streak).toBe(0);
  });

  it('полная неделя подряд — сегодня цикл начинается заново', () => {
    const week = days(
      '2026-09-20',
      '2026-09-19',
      '2026-09-18',
      '2026-09-17',
      '2026-09-16',
      '2026-09-15',
      '2026-09-14',
    );
    const state = dailyState(week, TODAY);
    expect(state.day).toBe(1);
    expect(state.coins).toBe(DAILY_REWARD_COINS[0]);
  });

  it('седьмой день — самая крупная награда, а завтра снова первая', () => {
    const six = days('2026-09-20', '2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15');
    const state = dailyState(six, TODAY);
    expect(state.day).toBe(7);
    expect(state.coins).toBe(DAILY_REWARD_COINS[6]);
    expect(state.nextCoins).toBe(DAILY_REWARD_COINS[0]);
  });
});
