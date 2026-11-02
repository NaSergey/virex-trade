import type { MetadataRoute } from 'next';
import { LANDING_PATH, SITE_URL } from '@/shared/config/site';

/** Открытых страниц две — главная на каждом языке. Остальное за входом. */
export default function sitemap(): MetadataRoute.Sitemap {
  const en = `${SITE_URL}${LANDING_PATH.en}`;
  const ru = `${SITE_URL}${LANDING_PATH.ru}`;
  const languages = { en, ru, 'x-default': en };
  return [en, ru].map((url) => ({ url, alternates: { languages } }));
}
