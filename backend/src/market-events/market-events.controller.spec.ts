import { MarketEventsController } from './market-events.controller';

/**
 * T-final-review (IMPORTANT): `days` шёл прямо в кэш-ключ и в тяжёлый обход
 * свечей `MarketEventsService` без зажима — `?days=100000` означал полный
 * проход по всем 17520 свечам на каждый запрос, `?days=abc` давал `NaN` из
 * `parseInt`, который ничего не отсекал сам по себе.
 */
function makeController() {
  const marketEvents = {
    getTimeSlots: jest.fn().mockResolvedValue({ success: true }),
    getHourlyStats: jest.fn().mockResolvedValue({ success: true }),
  };
  const controller = new MarketEventsController(marketEvents as any);
  return { controller, marketEvents };
}

describe('MarketEventsController — зажим `days` (T-final-review)', () => {
  it('без параметра — дефолт 730', async () => {
    const { controller, marketEvents } = makeController();
    await controller.getSeasonality(undefined, undefined);
    expect(marketEvents.getTimeSlots).toHaveBeenCalledWith(60, 730);
  });

  it('экстремально большое значение — клампится к 730, не идёт мусором дальше', async () => {
    const { controller, marketEvents } = makeController();
    await controller.getSeasonality('240', '100000');
    expect(marketEvents.getTimeSlots).toHaveBeenCalledWith(240, 730);
  });

  it('нечисловое значение (NaN из parseInt) — дефолт 730', async () => {
    const { controller, marketEvents } = makeController();
    await controller.getHourly('abc');
    expect(marketEvents.getHourlyStats).toHaveBeenCalledWith(730);
  });

  it('ноль и отрицательное — дефолт 730, а не 0/отрицательное окно', async () => {
    const { controller, marketEvents } = makeController();
    await controller.getSeasonality('60', '0');
    expect(marketEvents.getTimeSlots).toHaveBeenLastCalledWith(60, 730);

    await controller.getSeasonality('60', '-5');
    expect(marketEvents.getTimeSlots).toHaveBeenLastCalledWith(60, 730);
  });

  it('таймфрейм — только из списка слотов; мелкие и мусор — часовик', async () => {
    const { controller, marketEvents } = makeController();
    await controller.getSeasonality('1', '365');
    expect(marketEvents.getTimeSlots).toHaveBeenLastCalledWith(60, 365);

    await controller.getSeasonality('15', '365');
    expect(marketEvents.getTimeSlots).toHaveBeenLastCalledWith(60, 365);

    await controller.getSeasonality('abc', '365');
    expect(marketEvents.getTimeSlots).toHaveBeenLastCalledWith(60, 365);

    await controller.getSeasonality('1440', '365');
    expect(marketEvents.getTimeSlots).toHaveBeenLastCalledWith(1440, 365);
  });

  it('валидное значение в пределах диапазона проходит как есть', async () => {
    const { controller, marketEvents } = makeController();
    await controller.getHourly('30');
    expect(marketEvents.getHourlyStats).toHaveBeenCalledWith(30);
  });
});
