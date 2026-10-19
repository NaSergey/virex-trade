import { pickCandidates, volumesOf } from './candidates';
import type { LeaderboardRow } from './hl-types';

const row = (o: {
  addr?: string;
  av?: number;
  all?: number;
  month?: number;
  mvlm?: number;
  wvlm?: number;
}): LeaderboardRow => ({
  ethAddress: o.addr ?? '0xAbC0000000000000000000000000000000000001',
  accountValue: String(o.av ?? 50_000),
  displayName: null,
  windowPerformances: [
    ['day', { pnl: '0', roi: '0', vlm: '0' }],
    ['week', { pnl: '0', roi: '0', vlm: String(o.wvlm ?? 1000) }],
    [
      'month',
      { pnl: String(o.month ?? 100), roi: '0', vlm: String(o.mvlm ?? 5000) },
    ],
    ['allTime', { pnl: String(o.all ?? 1000), roi: '0', vlm: '1' }],
  ],
});

describe('pickCandidates', () => {
  it('берёт кошелёк в плюсе за месяц и всё время, с оборотом и балансом от $10k; адрес — в нижнем регистре', () => {
    expect(pickCandidates([row({})])).toEqual([
      {
        address: '0xabc0000000000000000000000000000000000001',
        volumeWeek: 1000,
      },
    ]);
  });

  it.each([
    ['баланс меньше $10k', { av: 9_999 }],
    ['минус за всё время', { all: -1 }],
    ['ноль за месяц', { month: 0 }],
    ['без оборота за месяц', { mvlm: 0 }],
    ['не адрес', { addr: 'vault' }],
  ])('отбрасывает: %s', (_, o) => {
    expect(pickCandidates([row(o)])).toEqual([]);
  });

  it('адрес — один раз, даже если лидерборд повторил строку', () => {
    expect(
      pickCandidates([
        row({}),
        row({ addr: '0xabc0000000000000000000000000000000000001' }),
      ]),
    ).toHaveLength(1);
  });

  it('volumesOf — оборот за 7 дней у всех строк, не только у кандидатов', () => {
    const m = volumesOf([row({ av: 1, wvlm: 77 })]);
    expect(m.get('0xabc0000000000000000000000000000000000001')).toBe(77);
  });
});
