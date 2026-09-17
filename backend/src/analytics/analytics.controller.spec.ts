import { AnalyticsController } from './analytics.controller';

/**
 * T-final-review (IMPORTANT): `symbol` шёл прямо в ключ `longShortRatioCache`/
 * `liquidityHistoryCache` (analytics.service.ts) без проверки формата — сколько
 * угодно различных значений от аутентифицированного пользователя означало
 * сколько угодно записей в этих Map, без вытеснения.
 */
function makeController() {
  const analyticsService = {
    getLiquidityHistory: jest.fn().mockResolvedValue({ success: true }),
    getLongShortRatio: jest.fn().mockResolvedValue({ success: true }),
  };
  const controller = new AnalyticsController(analyticsService as any);
  return { controller, analyticsService };
}

describe('AnalyticsController — валидация `symbol` (T-final-review)', () => {
  it('без параметра — дефолт BTCUSDT', async () => {
    const { controller, analyticsService } = makeController();
    await controller.getLiquidityHistory(undefined);
    expect(analyticsService.getLiquidityHistory).toHaveBeenCalledWith('BTCUSDT');
  });

  it('мусорный символ (не формат тикера) — падает на дефолт, не идёт дальше как есть', async () => {
    const { controller, analyticsService } = makeController();
    await controller.getMarketSentiment('<script>alert(1)</script>');
    expect(analyticsService.getLongShortRatio).toHaveBeenCalledWith('BTCUSDT');
  });

  it('строчные буквы (не по формату) — тоже падает на дефолт', async () => {
    const { controller, analyticsService } = makeController();
    await controller.getLiquidityHistory('btcusdt');
    expect(analyticsService.getLiquidityHistory).toHaveBeenCalledWith('BTCUSDT');
  });

  it('неограниченно длинная строка — падает на дефолт, не растит кэш безгранично', async () => {
    const { controller, analyticsService } = makeController();
    await controller.getMarketSentiment('A'.repeat(500));
    expect(analyticsService.getLongShortRatio).toHaveBeenCalledWith('BTCUSDT');
  });

  it('валидный тикер проходит как есть', async () => {
    const { controller, analyticsService } = makeController();
    await controller.getLiquidityHistory('ETHUSDT');
    expect(analyticsService.getLiquidityHistory).toHaveBeenCalledWith('ETHUSDT');

    await controller.getMarketSentiment('1000PEPEUSDT');
    expect(analyticsService.getLongShortRatio).toHaveBeenCalledWith('1000PEPEUSDT');
  });
});
