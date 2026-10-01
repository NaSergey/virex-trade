import { boardOrder } from './board';

const row = (id: string, relation: 'created' | 'joined' | 'other', status: string, createdAt: number) => ({
  id,
  relation,
  status,
  createdAt: new Date(createdAt),
});

describe('boardOrder', () => {
  it('созданные мной — первыми, потом где я играю, потом чужие', () => {
    const rows = [row('o', 'other', 'running', 3), row('j', 'joined', 'running', 2), row('c', 'created', 'running', 1)];

    expect(boardOrder(rows).map((r) => r.id)).toEqual(['c', 'j', 'o']);
  });

  it('внутри группы — идущие, набор, завершённые, отменённые', () => {
    const rows = [
      row('cancelled', 'created', 'cancelled', 4),
      row('finished', 'created', 'finished', 3),
      row('lobby', 'created', 'lobby', 2),
      row('running', 'created', 'running', 1),
    ];

    expect(boardOrder(rows).map((r) => r.id)).toEqual(['running', 'lobby', 'finished', 'cancelled']);
  });

  it('внутри статуса — свежие сверху', () => {
    const rows = [row('old', 'other', 'lobby', 1), row('new', 'other', 'lobby', 2)];

    expect(boardOrder(rows).map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('исходный массив не меняет', () => {
    const rows = [row('a', 'other', 'lobby', 1), row('b', 'created', 'lobby', 2)];

    boardOrder(rows);

    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
