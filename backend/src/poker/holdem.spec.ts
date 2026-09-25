import { act, buildPots, forceFold, HandState, HoldemError, legal, startHand, StartSeat } from './holdem';

/** Колода по порядку раздачи: сначала карманные (по кругу от SB), дальше сжиг/борд. */
const deck = (s: string) => s.split(' ');
const seats = (...stacks: number[]): StartSeat[] =>
  stacks.map((stack, i) => ({ userId: `u${i}`, seatIndex: i, stack }));
const total = (s: HandState) =>
  s.players.reduce((a, p) => a + p.stack, 0) + s.players.reduce((a, p) => a + p.committed, 0);
const after = (s: HandState) =>
  Object.fromEntries(s.players.map((p) => [p.userId, p.stack + (s.result?.payouts[p.userId] ?? 0)]));

// 52 карты, чтобы колоды хватило на любую раздачу теста.
const FILLER = '2c 3c 4c 5c 6c 7c 8c 9c Tc Jc Qc Kc Ac 2d 3d 4d 5d 6d 7d 8d 9d Td Jd Qd Kd Ad';

describe('holdem', () => {
  it('три игрока: кнопка, блайнды, первым ходит UTG = кнопка', () => {
    const s = startHand(seats(1000, 1000, 1000), -1, 5, 10, deck(FILLER));
    expect(s.button).toBe(0);
    expect(s.players[1].bet).toBe(5);
    expect(s.players[2].bet).toBe(10);
    expect(s.toAct).toBe(0);
    expect(legal(s, 'u0')).toEqual({ toCall: 10, canCheck: false, minRaiseTo: 20, maxRaiseTo: 1000 });
  });

  it('хедз-ап: кнопка ставит SB и ходит первой префлоп, последней — после', () => {
    let s = startHand(seats(1000, 1000), 0, 5, 10, deck(FILLER));
    expect(s.button).toBe(1);
    expect(s.players[1].bet).toBe(5);
    expect(s.toAct).toBe(1);
    s = act(s, 'u1', { type: 'call' });
    expect(s.toAct).toBe(0); // опцион большого блайнда
    s = act(s, 'u0', { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(0);
  });

  it('чужой ход и неверное действие — отказ', () => {
    const s = startHand(seats(1000, 1000, 1000), -1, 5, 10, deck(FILLER));
    expect(() => act(s, 'u1', { type: 'fold' })).toThrow(HoldemError);
    expect(() => act(s, 'u0', { type: 'check' })).toThrow(HoldemError);
    expect(() => act(s, 'u0', { type: 'raise', to: 15 })).toThrow(HoldemError);
  });

  it('все сбросили — банк последнему без вскрытия', () => {
    let s = startHand(seats(1000, 1000, 1000), -1, 5, 10, deck(FILLER));
    s = act(s, 'u0', { type: 'raise', to: 30 });
    s = act(s, 'u1', { type: 'fold' });
    s = act(s, 'u2', { type: 'fold' });
    expect(s.street).toBe('done');
    expect(s.result!.payouts).toEqual({ u0: 45 });
    expect(s.result!.shown).toEqual({});
    expect(Object.values(after(s)).reduce((a, b) => a + b, 0)).toBe(3000);
  });

  it('рейз снова открывает торговлю', () => {
    let s = startHand(seats(1000, 1000, 1000), -1, 5, 10, deck(FILLER));
    s = act(s, 'u0', { type: 'call' });
    s = act(s, 'u1', { type: 'call' });
    s = act(s, 'u2', { type: 'raise', to: 40 });
    expect(s.street).toBe('preflop');
    expect(s.toAct).toBe(0);
    expect(legal(s, 'u0')!.minRaiseTo).toBe(70);
  });

  it('олл-ин и сайд-пот: короткий стек выигрывает только основной банк', () => {
    // Порядок раздачи от SB (u1): u1,u2,u0,u1,u2,u0.
    // u0: A A, u1: K K, u2: 7 2. Борд без помощи.
    const d = deck('Kh Qs Ah Kd 2h As 3c 8c 9d Js 4d 5s 3h 6h');
    // u0 короткий — 100.
    let s = startHand(seats(100, 1000, 1000), -1, 5, 10, d);
    s = act(s, 'u0', { type: 'raise', to: 100 }); // олл-ин
    s = act(s, 'u1', { type: 'raise', to: 300 });
    s = act(s, 'u2', { type: 'call' });
    // Флоп: двое с фишками продолжают торговлю.
    expect(s.street).toBe('flop');
    s = act(s, 'u1', { type: 'check' });
    s = act(s, 'u2', { type: 'check' });
    s = act(s, 'u1', { type: 'check' });
    s = act(s, 'u2', { type: 'check' });
    s = act(s, 'u1', { type: 'check' });
    s = act(s, 'u2', { type: 'check' });
    expect(s.street).toBe('done');
    // Основной банк 300 — тузам, сайд 400 — королям.
    expect(s.result!.payouts).toEqual({ u0: 300, u1: 400 });
    expect(Object.keys(s.result!.shown).sort()).toEqual(['u0', 'u1', 'u2']);
    expect(Object.values(after(s)).reduce((a, b) => a + b, 0)).toBe(2100);
  });

  it('все в олл-ине — борд докладывается сам', () => {
    let s = startHand(seats(100, 100), -1, 5, 10, deck(FILLER));
    s = act(s, s.players[s.toAct!].userId, { type: 'raise', to: 100 });
    s = act(s, s.players[s.toAct!].userId, { type: 'call' });
    expect(s.street).toBe('done');
    expect(s.board).toHaveLength(5);
    expect(total(s)).toBe(200);
  });

  it('равные руки делят банк', () => {
    // Борд — роял-флеш, у всех одинаково.
    const d = deck('2c 3c 2d 3d 9c As Ks Qs 8c Js 7c Ts');
    let s = startHand(seats(1000, 1000), -1, 5, 10, d);
    // Кнопка u0 (SB 5), u1 BB.
    s = act(s, 'u0', { type: 'call' });
    s = act(s, 'u1', { type: 'check' });
    for (let i = 0; i < 6; i++) s = act(s, s.players[s.toAct!].userId, { type: 'check' });
    expect(s.street).toBe('done');
    expect(s.result!.payouts).toEqual({ u0: 10, u1: 10 });
  });

  it('уход не в свой ход — фолд, ход остаётся у текущего', () => {
    let s = startHand(seats(1000, 1000, 1000), -1, 5, 10, deck(FILLER));
    s = forceFold(s, 'u2');
    expect(s.players[2].folded).toBe(true);
    expect(s.toAct).toBe(0);
    s = act(s, 'u0', { type: 'fold' });
    expect(s.street).toBe('done');
    expect(s.result!.payouts).toEqual({ u1: 15 });
  });

  it('банки по уровням', () => {
    const p = (committed: number, folded = false) =>
      ({ userId: '', seatIndex: 0, stack: 0, bet: 0, committed, folded, allIn: false, acted: false, cards: [] });
    const pots = buildPots([p(50), p(200), p(200), p(100, true)]);
    expect(pots).toEqual([
      { amount: 200, eligible: [0, 1, 2] },
      { amount: 350, eligible: [1, 2] },
    ]);
  });
});
