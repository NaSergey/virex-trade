// Single source of truth for the access-token signing secret.
//
// It used to be inlined (with its dev fallback) in both AuthService and
// JwtStrategy: two copies that sign and verify tokens, so any drift between
// them invalidates every token silently. It also meant a production deploy
// that forgot JWT_ACCESS_SECRET — or copied .env.example verbatim — happily
// signed tokens with a secret published in this repository, letting anyone
// forge an access token for any user id.
const DEV_FALLBACK_SECRET = 'dev-access-secret-change-me';

/** Подпись токенов в юнит-тестах: наружу они не уходят и ничего не защищают. */
const TEST_SECRET = 'jwt-secret-for-unit-tests-only';

/**
 * Секрет обязателен везде, кроме юнит-тестов.
 *
 * Раньше отказ был обусловлен `NODE_ENV === 'production'`, и это оказалось
 * ненадёжной опорой: в `docker-compose.yml` переменная не выставлена вовсе, а
 * запуск идёт через `start:dev` — то есть на сервере проверка не срабатывала
 * бы, и забытый `JWT_ACCESS_SECRET` молча подменялся плейсхолдером из этого
 * репозитория. Подписанный им токен подделывается кем угодно на любой userId.
 *
 * Теперь условие обратное: секрета нет или он плейсхолдерный — сервер не
 * поднимается. Забытая переменная закрывает доступ, а не открывает; тот же
 * принцип, по которому обязателен CREDENTIALS_ENCRYPTION_KEY, и по которому
 * почта владельца зашита в код, а не в окружение (см. `admin/owner.ts`).
 */
export function resolveJwtAccessSecret(): string {
  const secret = (process.env.JWT_ACCESS_SECRET ?? '').trim();

  // Тесты конструируют AuthService напрямую и окружения не имеют. Отдельная
  // константа, а не общий плейсхолдер: так значение из .env.example нигде не
  // становится рабочим секретом.
  if (process.env.NODE_ENV === 'test') return secret || TEST_SECRET;

  if (!secret || secret === DEV_FALLBACK_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET is unset or still the development placeholder. ' +
        'Generate a real one with: openssl rand -hex 32',
    );
  }

  return secret;
}
