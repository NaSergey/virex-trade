/**
 * Картинка профиля, а у кого своей нет — общая заглушка (силуэт игрока на
 * наклонной полосе, владелец 2026-10-17). Исходник заглушки —
 * `public/assets/profile.png`, на сайт идёт его копия 512×512 в WebP (~11 КБ):
 * заглушку видит каждый, у кого нет картинки, в шапке на каждой странице.
 *
 * Не через next/image: адрес своей картинки версионный и с кэшем на год,
 * оптимизатору пришлось бы ходить за ней на API.
 */
export const DEFAULT_AVATAR = '/assets/profile.webp';

export function ProfilePicture({ src }: { src?: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src || DEFAULT_AVATAR} alt="" />;
}
