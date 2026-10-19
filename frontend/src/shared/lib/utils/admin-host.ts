/**
 * Админка живёт на поддомене `admin.*` того же Next (спека
 * docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md):
 * гейт входа — по заголовку Host в `proxy.ts`, адреса переписываются в
 * `app/admin/*` rewrites `beforeFiles` в `next.config.ts` (`ADMIN_HOST` там —
 * то же правило, держать их вместе).
 */
export function isAdminHost(host: string | null | undefined): host is string {
  return !!host && /^admin\./i.test(host);
}

/** Видимый адрес страницы админки — без внутреннего префикса `/admin`. */
export function adminPath(pathname: string): string {
  return pathname.replace(/^\/admin(?=\/|$)/, '') || '/';
}

/**
 * Origin админки рядом с текущим: `protocol` — как у `location` («https:»),
 * `host` — с портом. С `www.` админка — `admin.<домен>`, а не `admin.www.<домен>`.
 */
export function adminOrigin(protocol: string, host: string): string {
  return `${protocol}//admin.${host.replace(/^www\./i, '')}`;
}
