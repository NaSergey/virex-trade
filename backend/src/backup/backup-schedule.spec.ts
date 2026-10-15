import { isDue, lastSlot, partNames, pgEnvOf } from './backup-schedule';

describe('lastSlot', () => {
  it('в понедельник после полуночи UTC — эта же полночь', () => {
    expect(lastSlot(new Date('2026-10-19T00:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(lastSlot(new Date('2026-10-19T15:30:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('в воскресенье вечером — прошлый понедельник', () => {
    expect(lastSlot(new Date('2026-10-18T23:59:59Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('в середине недели — её понедельник', () => {
    expect(lastSlot(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });
});

describe('isDue', () => {
  const now = new Date('2026-10-19T03:00:00Z'); // понедельник

  it('бэкапа ещё не было — пора', () => {
    expect(isDue(null, now)).toBe(true);
  });

  it('последний — до слота этой недели — пора', () => {
    expect(isDue(new Date('2026-10-12T00:05:00Z'), now)).toBe(true);
  });

  it('уже снят после слота — перезапуск не шлёт второй раз', () => {
    expect(isDue(new Date('2026-10-19T00:01:00Z'), now)).toBe(false);
  });

  it('пропущенный слот догоняется в середине недели', () => {
    expect(isDue(new Date('2026-10-12T00:05:00Z'), new Date('2026-10-21T10:00:00Z'))).toBe(true);
  });
});

describe('pgEnvOf', () => {
  it('раскладывает адрес Prisma на переменные libpq без её параметров', () => {
    expect(
      pgEnvOf('postgresql://virex:p%40ss@db:5432/virex?schema=public&connection_limit=5&pool_timeout=20'),
    ).toEqual({ PGHOST: 'db', PGPORT: '5432', PGUSER: 'virex', PGPASSWORD: 'p@ss', PGDATABASE: 'virex' });
  });

  it('порт по умолчанию — 5432', () => {
    expect(pgEnvOf('postgresql://u:p@localhost/x').PGPORT).toBe('5432');
  });
});

describe('partNames', () => {
  it('одна часть — имя без суффикса', () => {
    expect(partNames('a.dump', 1)).toEqual(['a.dump']);
  });

  it('несколько — с номером через ноль, чтобы cat part* склеивал по порядку', () => {
    expect(partNames('a.dump', 3)).toEqual(['a.dump.part01', 'a.dump.part02', 'a.dump.part03']);
  });
});
