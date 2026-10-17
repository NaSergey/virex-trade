import { ForbiddenException } from '@nestjs/common';

/**
 * Демо-аккаунт витрины. Он общий: его кредами входит кнопка «Посмотреть демо»
 * (`frontend/src/features/auth/model/demo.ts`), и раскладывает его
 * `scripts/seed-demo.ts` — там почта повторена, потому что скрипты живут вне
 * графа приложения.
 *
 * Поэтому учётные данные и витрина демо не меняются никем: смена пароля
 * сломала бы «Посмотреть демо» всем, а имя и картинка — то, что видит каждый
 * следующий посетитель.
 */
export const DEMO_EMAIL = 'demo@example.com';

export const isDemoEmail = (email: string | null | undefined): boolean =>
  (email ?? '').trim().toLowerCase() === DEMO_EMAIL;

export const demoLocked = () =>
  new ForbiddenException({ message: 'Демо-аккаунт общий — его не меняют', code: 'ACCOUNT_DEMO_LOCKED' });
