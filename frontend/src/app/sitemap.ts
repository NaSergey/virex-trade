import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { JOURNAL_URL, LANDING_PATH, SITE_URL } from '@/shared/config/site';
import { partOfHost } from '@/shared/lib/utils/app-part';

/** Открытых страниц у каждой части две — главная на каждом языке. Остальное за входом. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const part = partOfHost((await headers()).get('host'));
  const base = part === 'journal' ? JOURNAL_URL : SITE_URL;
  const en = `${base}${LANDING_PATH.en}`;
  const ru = `${base}${LANDING_PATH.ru}`;
  const languages = { en, ru, 'x-default': en };
  return [en, ru].map((url) => ({ url, alternates: { languages } }));
}
