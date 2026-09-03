import { resolveJwtAccessSecret } from './jwt-secret';

/**
 * Проверка того, что защита не зависит от NODE_ENV: прежняя версия падала
 * только при `NODE_ENV === 'production'`, а в развёртывании эта переменная не
 * выставлена — то есть на сервере проверка не срабатывала.
 */
describe('resolveJwtAccessSecret', () => {
  const saved = { secret: process.env.JWT_ACCESS_SECRET, env: process.env.NODE_ENV };

  afterEach(() => {
    process.env.JWT_ACCESS_SECRET = saved.secret;
    process.env.NODE_ENV = saved.env;
  });

  const withEnv = (secret: string | undefined, nodeEnv: string | undefined) => {
    if (secret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = secret;
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  };

  it('отдаёт заданный секрет', () => {
    withEnv('a'.repeat(64), 'production');
    expect(resolveJwtAccessSecret()).toBe('a'.repeat(64));
  });

  // Ровно тот случай, что стоял на сервере: переменной окружения нет, и
  // прежняя версия молча подписывала токены плейсхолдером из репозитория.
  it('падает без секрета, когда NODE_ENV не выставлен', () => {
    withEnv(undefined, undefined);
    expect(() => resolveJwtAccessSecret()).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('падает на плейсхолдере из .env.example, когда NODE_ENV не выставлен', () => {
    withEnv('dev-access-secret-change-me', undefined);
    expect(() => resolveJwtAccessSecret()).toThrow(/placeholder/);
  });

  it('падает на плейсхолдере и в development', () => {
    withEnv('dev-access-secret-change-me', 'development');
    expect(() => resolveJwtAccessSecret()).toThrow(/placeholder/);
  });

  it('падает на пустой строке и пробелах', () => {
    withEnv('   ', 'production');
    expect(() => resolveJwtAccessSecret()).toThrow(/JWT_ACCESS_SECRET/);
  });

  // Юнит-тесты конструируют AuthService напрямую, окружения у них нет.
  it('в тестовой среде отдаёт заглушку вместо отказа', () => {
    withEnv(undefined, 'test');
    expect(resolveJwtAccessSecret()).toBe('jwt-secret-for-unit-tests-only');
  });

  it('в тестовой среде заданный секрет всё равно имеет приоритет', () => {
    withEnv('real-secret', 'test');
    expect(resolveJwtAccessSecret()).toBe('real-secret');
  });
});
