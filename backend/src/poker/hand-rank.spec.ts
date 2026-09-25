import { bestHand, evaluate5 } from './hand-rank';

const h = (s: string) => s.split(' ');

describe('hand-rank', () => {
  it('распознаёт категории', () => {
    expect(bestHand(h('As Ks Qs Js Ts 2d 3c')).category).toBe('straightFlush');
    expect(bestHand(h('9c 9d 9h 9s 2d 3c 4h')).category).toBe('quads');
    expect(bestHand(h('9c 9d 9h 2s 2d 3c 4h')).category).toBe('fullHouse');
    expect(bestHand(h('2h 7h 9h Jh Kh 2d 3c')).category).toBe('flush');
    expect(bestHand(h('As 2d 3c 4h 5s 9d Kc')).category).toBe('straight');
    expect(bestHand(h('7c 7d 7h 2s 9d Jc Kh')).category).toBe('trips');
    expect(bestHand(h('7c 7d 2h 2s 9d Jc Kh')).category).toBe('twoPair');
    expect(bestHand(h('7c 7d 3h 2s 9d Jc Kh')).category).toBe('pair');
    expect(bestHand(h('7c 4d 3h 2s 9d Jc Kh')).category).toBe('high');
  });

  it('колесо младше шестёрочного стрита', () => {
    expect(evaluate5(h('As 2d 3c 4h 5s'))).toBeLessThan(evaluate5(h('2d 3c 4h 5s 6d')));
  });

  it('кикер решает при равной паре', () => {
    const a = bestHand(h('Ac Ad Kh 7s 4d 3c 2h'));
    const b = bestHand(h('Ac Ad Qh 7s 4d 3c 2h'));
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('одинаковая лучшая пятёрка — равный счёт', () => {
    const board = 'As Ks Qd Jc Th';
    expect(bestHand(h(`${board} 2c 3d`)).score).toBe(bestHand(h(`${board} 4c 5d`)).score);
  });

  it('старшая тройка решает фулл-хаус', () => {
    expect(evaluate5(h('Kc Kd Kh 2s 2d'))).toBeGreaterThan(evaluate5(h('Qc Qd Qh As Ad')));
  });
});
