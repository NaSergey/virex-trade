/**
 * Ставить ли куку сессии только по HTTPS.
 *
 * Раньше это решал `NODE_ENV === 'production'` прямо в контроллере, и опора
 * оказалась ложной: в `docker-compose.yml` переменная не выставлена вовсе, то
 * есть боевой сервер отдавал refresh-куку без флага Secure. Адрес фронтенда
 * надёжнее: он и так обязан быть верным, иначе не сойдётся CORS, и он же
 * прямо говорит, есть ли TLS.
 *
 * «Безопасного умолчания» здесь не существует: выставить Secure на
 * HTTP-развёртывании значит выбросить куку совсем и сломать вход. Поэтому
 * неизвестное или пустое значение читается как HTTP.
 */
export function useSecureCookie(frontendUrl: string | undefined = process.env.FRONTEND_URL): boolean {
  return (frontendUrl ?? '').trim().toLowerCase().startsWith('https://');
}
