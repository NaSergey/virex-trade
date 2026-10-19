import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Браузер ведёт свою машину той же физикой, что сервер (спека, «Симуляция — одна
 * на сервер и браузер»). Сборки раздельные, общего пакета нет — у фронта копия
 * каталога, и здесь она сверяется побайтно. Упал — скопируйте `sim/` заново
 * (все .ts, кроме spec) в `frontend/src/entities/race/model/sim/`.
 */
describe('копия симуляции у фронта', () => {
  const back = join(__dirname, 'sim');
  const front = join(
    __dirname,
    '../../../frontend/src/entities/race/model/sim',
  );
  const list = (dir: string) =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(f))
      .sort();

  it('совпадает с серверной побайтно', () => {
    const files = list(back);
    expect(list(front)).toEqual(files);
    for (const f of files)
      expect(`${f}:\n${readFileSync(join(front, f), 'utf8')}`).toBe(
        `${f}:\n${readFileSync(join(back, f), 'utf8')}`,
      );
  });
});
