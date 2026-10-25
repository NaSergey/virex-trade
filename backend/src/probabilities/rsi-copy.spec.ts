import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Дивергенции в истории сервер считает тем же кодом, что рисует панель RSI
 * терминала (спека 2026-10-25). Сборки раздельные — у сервера копия, и здесь
 * она сверяется побайтно. Упал — правка сделана в одной копии: перенесите её во
 * вторую (формат — prettier бэкенда).
 */
describe('копия rsi.ts', () => {
  it('совпадает с фронтом побайтно', () => {
    const back = readFileSync(join(__dirname, 'rsi.ts'), 'utf8');
    const front = readFileSync(
      join(
        __dirname,
        '../../../frontend/src/widgets/backtest-session/lib/rsi.ts',
      ),
      'utf8',
    );
    expect(front).toBe(back);
  });
});
