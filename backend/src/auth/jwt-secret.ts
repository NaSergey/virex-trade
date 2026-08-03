// Single source of truth for the access-token signing secret.
//
// It used to be inlined (with its dev fallback) in both AuthService and
// JwtStrategy: two copies that sign and verify tokens, so any drift between
// them invalidates every token silently. It also meant a production deploy
// that forgot JWT_ACCESS_SECRET — or copied .env.example verbatim — happily
// signed tokens with a secret published in this repository, letting anyone
// forge an access token for any user id.
const DEV_FALLBACK_SECRET = 'dev-access-secret-change-me';

export function resolveJwtAccessSecret(): string {
  const secret = (process.env.JWT_ACCESS_SECRET ?? '').trim();
  const isPlaceholder = !secret || secret === DEV_FALLBACK_SECRET;

  if (process.env.NODE_ENV === 'production' && isPlaceholder) {
    throw new Error(
      'JWT_ACCESS_SECRET is unset or still the development placeholder. ' +
        'Generate a real one with: openssl rand -hex 32',
    );
  }

  return secret || DEV_FALLBACK_SECRET;
}
