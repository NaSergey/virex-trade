/**
 * Картинка профиля — чистые правила без БД: какой файл принять и по какому
 * адресу его отдавать.
 *
 * Клиент режет картинку в квадрат 256×256 и сжимает сам (canvas), поэтому
 * сервер не перекодирует её и не тянет ради этого зависимостей. Но и не
 * верит ни расширению, ни `Content-Type` загрузки: тип определяется по первым
 * байтам, и отдаётся картинка ровно с ним. SVG в списке нет намеренно — это
 * документ со скриптами, а не картинка.
 */

/** Предел файла. Квадрат 256×256 в WebP весит десятки килобайт; запас — на PNG. */
export const AVATAR_MAX_BYTES = 512 * 1024;

export type AvatarMime = 'image/png' | 'image/jpeg' | 'image/webp';

const startsWith = (buf: Buffer, sig: number[], at = 0) =>
  buf.length >= at + sig.length && sig.every((b, i) => buf[at + i] === b);

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Тип картинки по сигнатуре файла; не картинка из списка — null. */
export function sniffImage(buf: Buffer): AvatarMime | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // RIFF-контейнер бывает и звуком, и видео: картинкой его делает метка WEBP.
  if (startsWith(buf, ascii('RIFF')) && startsWith(buf, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/**
 * Адрес картинки. Версия — время загрузки: адрес меняется вместе с
 * картинкой, поэтому отдавать её можно с кэшем на год, и новая не застрянет
 * за старой ни в браузере, ни в прокси.
 */
export function avatarUrl(userId: string, avatarAt: Date | null): string | null {
  return avatarAt ? `/api/profile/${userId}/avatar?v=${avatarAt.getTime()}` : null;
}
