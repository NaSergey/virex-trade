import { ratingRows } from './rating';

/**
 * Рейтинг — про игру целиком, а не про один турнир. Очки за турнир равны
 * «участников минус место»: обыграть девятерых весомее, чем одного, и это
 * единственное, что таблица обязана выражать.
 */
const row = (tournamentId: string, userId: string, place: number) => ({
  tournamentId,
  userId,
  name: userId.toUpperCase(),
  place,
});

describe('ratingRows', () => {
  it('очки за турнир — участников минус место', () => {
    const { rows } = ratingRows([row('t1', 'a', 1), row('t1', 'b', 2), row('t1', 'c', 3)], 'a');

    expect(rows.map((r) => [r.userId, r.points])).toEqual([
      ['a', 2],
      ['b', 1],
      ['c', 0],
    ]);
  });

  it('складывает очки по всем турнирам и считает победы', () => {
    const { rows } = ratingRows(
      [
        row('t1', 'a', 1),
        row('t1', 'b', 2),
        row('t2', 'a', 2),
        row('t2', 'b', 1),
        row('t2', 'c', 3),
      ],
      'a',
    );

    // a: 1 (дуэль) + 1 (второе из трёх) = 2, одна победа;
    // b: 0 + 2 = 2, одна победа; c: 0, побед нет. a и b совпадают во всём, и
    // порядок между ними задаёт имя — иначе он зависел бы от порядка строк.
    expect(rows[0]).toMatchObject({ userId: 'a', points: 2, tournaments: 2, wins: 1 });
    expect(rows[1]).toMatchObject({ userId: 'b', points: 2, tournaments: 2, wins: 1 });
    expect(rows[2]).toMatchObject({ userId: 'c', points: 0, tournaments: 1, wins: 0 });
  });

  it('при равных очках и победах выше тот, кому хватило меньше турниров', () => {
    const { rows } = ratingRows(
      [
        // a берёт 2 очка за один турнир на трёх человек.
        row('t1', 'a', 1),
        row('t1', 'x', 2),
        row('t1', 'y', 3),
        // b набирает те же 2 очка за две дуэли.
        row('t2', 'b', 1),
        row('t2', 'x', 2),
        row('t3', 'b', 1),
        row('t3', 'y', 2),
      ],
      'a',
    );

    expect(rows[0].userId).toBe('b'); // 2 победы против одной
    expect(rows[1].userId).toBe('a');
  });

  it('места в рейтинге идут подряд от первого', () => {
    const { rows } = ratingRows([row('t1', 'a', 1), row('t1', 'b', 2)], 'a');
    expect(rows.map((r) => r.place)).toEqual([1, 2]);
  });

  it('строка вошедшего отдаётся отдельно, только если он не попал в таблицу', () => {
    const many = Array.from({ length: 60 }, (_, i) => row('t' + i, 'u' + i, 1));
    // Каждый выиграл свою дуэль, но у последнего соперников не было — 0 очков.
    many.push(row('t59', 'late', 2));

    const top = ratingRows(many, 'u0', 50);
    expect(top.rows).toHaveLength(50);
    expect(top.me).toBeNull(); // u0 и так в таблице

    const bottom = ratingRows(many, 'late', 50);
    expect(bottom.me).toMatchObject({ userId: 'late', points: 0 });
    expect(bottom.me!.place).toBeGreaterThan(50);
  });

  it('не игравший строки не получает', () => {
    expect(ratingRows([row('t1', 'a', 1), row('t1', 'b', 2)], 'нет').me).toBeNull();
  });

  it('пустой вход даёт пустую таблицу', () => {
    expect(ratingRows([], 'a')).toEqual({ rows: [], me: null });
  });
});
