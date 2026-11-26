import type { PrismaService } from '../prisma/prisma.service';

/**
 * Единственный аккаунт, которому открыта аналитика по пользователям.
 *
 * Почта зашита в код, а не лежит в переменной окружения и тем более не стоит
 * колонкой в `users`: раздел показывает почты и поведение всех пользователей
 * сервиса, и список тех, кому это видно, не должен зависеть ни от содержимого
 * БД (его меняет любой баг в коде, пишущем в профиль), ни от того, не забыли
 * ли выставить переменную при разворачивании — забытая переменная должна
 * закрывать доступ, а не открывать, и здесь забыть нечего.
 *
 * Владелец сменится — это будет изменение в коде, через ревью и историю
 * коммитов, что для такого права и правильно.
 */
export const OWNER_EMAIL = 'wxtx.ns@gmail.com';

/**
 * Почта сравнивается без учёта регистра и краевых пробелов.
 *
 * Только предварительный фильтр, а не право: до 2026-11-06 регистрация
 * сохраняла почту как набрали, и аккаунт `WXTX.NS@…` проходил эту проверку
 * наравне с настоящим. Право решает `isOwnerUser` — по id.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === OWNER_EMAIL;
}

type UserReader = Pick<PrismaService, 'user'>;

/**
 * Владелец — самый старый аккаунт с этой почтой в любом регистре. Не «любой
 * с такой почтой»: вариант в другом регистре, заведённый позже, — чужой
 * человек, и права владельца (админка, план, бэкап базы в Telegram) ему не
 * достаются, даже если строка уже лежит в базе.
 */
export function findOwner(
  prisma: UserReader,
): Promise<{ id: string; telegramChatId: string | null } | null> {
  return prisma.user.findFirst({
    where: { email: { equals: OWNER_EMAIL, mode: 'insensitive' } },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, telegramChatId: true },
  });
}

/** Тот ли это аккаунт, что `findOwner`. */
export async function isOwnerUser(
  prisma: UserReader,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const owner = await findOwner(prisma);
  return owner?.id === userId;
}
