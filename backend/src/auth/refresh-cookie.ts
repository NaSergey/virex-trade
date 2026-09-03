/**
 * Имя куки с refresh-токеном. Вынесено из контроллера: по нему же считает лимит
 * ClientThrottlerGuard, а разъехавшееся имя тихо вернуло бы лимит к счёту по IP.
 */
export const REFRESH_COOKIE = 'refresh_token';
