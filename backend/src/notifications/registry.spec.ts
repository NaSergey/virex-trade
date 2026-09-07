import { notifDef } from './registry';

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

describe('cooldown сигналов, которые шлёт таймер', () => {
  /**
   * WeeklyReportService тикает каждые десять минут и считает условием
   * «понедельник, 09:00 UTC» — то есть за час отправки условие держится шесть
   * тиков подряд. Единственное, что делает из шести тиков одно сообщение, —
   * cooldown самого сигнала.
   */
  it('report.weekly не повторяется внутри часа отправки', () => {
    const def = notifDef('report.weekly');
    expect(def).toBeDefined();
    expect(def!.cooldownMs).toBeGreaterThanOrEqual(HOUR);
    // И не должен доживать до следующего понедельника, иначе съест отчёт.
    expect(def!.cooldownMs).toBeLessThan(WEEK);
  });
});
