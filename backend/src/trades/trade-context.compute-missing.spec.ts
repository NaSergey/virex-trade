import { TradeContextService } from './trade-context.service';

/**
 * T10 Important fix (ревью): `computeMissing` бампит версию ДВАЖДЫ — сразу
 * после `dropStale()` (если она реально что-то удалила) и ещё раз после
 * пересчёта (если он реально что-то записал), а не один раз в конце. Между
 * этими двумя шагами реальный код делает сетевой поход к Bybit (`await`,
 * настоящая пауза event loop) — без бампа сразу после `dropStale()` окно
 * «снимок уже удалён, но ещё не пересчитан» было бы закоммичено в базу без
 * отражения в версии, и кэш агрегатов раздавал бы деградированный контекст
 * до следующего, ничем не связанного бампа.
 *
 * `dropStale`/`computeMissingQuality` — застаблены через `jest.spyOn` на
 * приватных методах инстанса: сам сценарий тестирует только политику бампа
 * в `computeMissing`, не их внутреннюю логику (она уже покрыта
 * `trade-context.quality.spec.ts` и остальными тестами модуля).
 */
describe('TradeContextService.computeMissing — политика бампа версии (T10)', () => {
  function makeService(dropped: number, quality: number) {
    const prisma = { trade: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const dataVersion = { bump: jest.fn().mockResolvedValue(undefined) };
    const service = new TradeContextService(prisma, {} as any, {} as any, dataVersion as any);
    jest.spyOn(service as any, 'dropStale').mockResolvedValue(dropped);
    jest.spyOn(service as any, 'computeMissingQuality').mockResolvedValue(quality);
    return { service, prisma, dataVersion };
  }

  it('dropStale ничего не снесла, пересчёт ничего не записал — бампа нет вовсе', async () => {
    const { service, dataVersion } = makeService(0, 0);
    const written = await service.computeMissing('u1');
    expect(written).toBe(0);
    expect(dataVersion.bump).not.toHaveBeenCalled();
  });

  it('dropStale снесла устаревшие снимки, пересчёт упал/ничего не написал — бамп ровно один раз (до пересчёта)', async () => {
    const { service, dataVersion } = makeService(3, 0);
    const written = await service.computeMissing('u1');
    expect(written).toBe(0);
    // Критично: бамп случился несмотря на written === 0 — иначе удаление
    // (уже закоммиченное) разошлось бы с кэшем до следующего тика.
    expect(dataVersion.bump).toHaveBeenCalledTimes(1);
    expect(dataVersion.bump).toHaveBeenCalledWith('u1');
  });

  it('dropStale ничего не сносила, пересчёт что-то записал — бамп ровно один раз (после пересчёта)', async () => {
    const { service, dataVersion } = makeService(0, 5);
    const written = await service.computeMissing('u1');
    expect(written).toBe(5);
    expect(dataVersion.bump).toHaveBeenCalledTimes(1);
  });

  it('и снос, и пересчёт что-то сделали — бамп дважды (перед сетевым походом и после)', async () => {
    const { service, dataVersion } = makeService(2, 4);
    const written = await service.computeMissing('u1');
    expect(written).toBe(4);
    expect(dataVersion.bump).toHaveBeenCalledTimes(2);
  });
});
