/**
 * Картинка профиля готовится в браузере, а не на сервере (спека 2026-10-16):
 * квадрат по центру, 512×512 (владелец 2026-10-17), WebP. Такой файл весит
 * 20–50 КБ, а сервер принимает не больше 64 КБ — «чтобы много в базе не
 * занимать», и перекодировать ему нечем и незачем.
 */

/** Сторона картинки профиля, px. */
export const AVATAR_SIDE = 512;
/** Предел сервера (`AVATAR_MAX_BYTES`) с запасом на заголовки части формы. */
export const AVATAR_LIMIT = 60 * 1024;
/** Качество WebP по очереди: первое, что влезло в предел, и уходит. */
const QUALITIES = [0.85, 0.75, 0.6, 0.45];

/**
 * Какой квадрат вырезать из картинки `w × h`: самый большой по центру. Широкую
 * режем по бокам, высокую — сверху и снизу, как обрезает любой кружок аватара.
 */
export function avatarPlan(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side };
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Файл, выбранный человеком, → квадрат 512×512 в WebP не больше предела.
 * Браузер, который не умеет кодировать WebP, отдаёт PNG — тогда жмём в JPEG
 * (сервер принимает и его). Не картинка или не влезло даже на худшем
 * качестве — `null`, и окно говорит об этом словами.
 */
export async function toAvatarBlob(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { sx, sy, side } = avatarPlan(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
  bitmap.close();

  for (const q of QUALITIES) {
    let blob = await encode(canvas, 'image/webp', q);
    if (blob && blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', q);
    if (blob && blob.size <= AVATAR_LIMIT) return blob;
  }
  return null;
}
