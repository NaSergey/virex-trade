import { ProfilePage } from '@/views/profile/Page';

/**
 * Профиль игрока — /profile/<id>. Один адрес на всех: свой профиль открывается
 * здесь же (`/profile` уводит сюда), и ссылку из строки браузера можно
 * отправить кому угодно.
 */
export default function Page() {
  return <ProfilePage />;
}
