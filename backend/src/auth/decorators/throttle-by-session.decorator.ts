import { SetMetadata } from '@nestjs/common';

export const THROTTLE_BY_SESSION = 'throttle:by-session';

/**
 * Считать лимит по предъявленной сессии, а не по IP.
 *
 * Ставится только там, где запрос уже несёт неугадываемый секрет (refresh-токен
 * — 48 случайных байт). На эндпоинтах, где секрет подбирают — вход и
 * регистрация, — этого делать нельзя: ключ пришёл бы от клиента, и подбиральщик
 * пароля обходил бы лимит, меняя куку на каждый запрос.
 */
export const ThrottleBySession = () => SetMetadata(THROTTLE_BY_SESSION, true);
