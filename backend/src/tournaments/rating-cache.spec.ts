import { TournamentsService } from './tournaments.service';

/**
 * Рейтинг пересчитывается не чаще раза в час (решение владельца 2026-10-02):
 * расчёт читает места всех участников всех завершённых турниров, а меняется
 * таблица только на финале. Профиль и страница рейтинга берут одну таблицу.
 */
const HOUR = 60 * 60_000;

function make() {
  const findMany = jest.fn().mockResolvedValue([
    { tournamentId: 't1', userId: 'a', place: 1, team: null, user: { name: 'A' } },
    { tournamentId: 't1', userId: 'b', place: 2, team: null, user: { name: 'B' } },
  ]);
  const prisma = { tournamentParticipant: { findMany } };
  const service = new TournamentsService(prisma as never, {} as never, {} as never, {} as never);
  return { service, findMany };
}

describe('рейтинг — раз в час', () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('профиль и страница рейтинга в течение часа берут один расчёт', async () => {
    const { service, findMany } = make();

    await service.rating('a');
    await service.ratingOf('b');
    now += HOUR - 1;
    await expect(service.ratingOf('a')).resolves.toMatchObject({ place: 1, points: 1 });

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('через час таблица пересчитывается', async () => {
    const { service, findMany } = make();
    await service.rating('a');
    now += HOUR;
    await service.rating('a');
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('два запроса в момент пересчёта ждут один расчёт', async () => {
    const { service, findMany } = make();
    await Promise.all([service.rating('a'), service.ratingOf('b')]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('упавший расчёт не кэшируется — следующий запрос считает заново', async () => {
    const { service, findMany } = make();
    findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(service.rating('a')).rejects.toThrow('db down');
    await expect(service.rating('a')).resolves.toMatchObject({ rows: expect.any(Array) });
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
