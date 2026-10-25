import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Дивергенции в истории сервер считает тем же кодом, что рисует панель RSI
 * терминала (спека 2026-10-25). Сборки раздельные — у сервера копия, и здесь
 * она сверяется побайтно. Упал — правка сделана в одной копии: перенесите её во
 * вторую (формат — prettier бэкенда). Переводы строк не считаются: на Windows
 * git разворачивает файлы в CRLF, а `eslint --fix` бэкенда пишет LF — копии
 * разошлись бы без единой правки кода.
 */
const read = (path: string) =>
  readFileSync(join(__dirname, path), 'utf8').replace(/\r\n/g, '\n');

describe('копия rsi.ts', () => {
  it('совпадает с фронтом побайтно', () => {
    expect(
      read('../../../frontend/src/widgets/backtest-session/lib/rsi.ts'),
    ).toBe(read('rsi.ts'));
  });
});
