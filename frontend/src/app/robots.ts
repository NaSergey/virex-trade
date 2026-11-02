import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { JOURNAL_URL, SITE_URL } from '@/shared/config/site';
import { partOfHost } from '@/shared/lib/utils/app-part';

/**
 * Площадка и журнал открыты целиком: закрытые страницы и так уводят гостя на главную,
 * а запрет здесь оставил бы их в выдаче голыми адресами. `/_next/` и `/assets/`
 * закрывать нельзя — без них поисковик не соберёт страницу. Поддомен админки
 * поисковику не нужен вовсе.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const part = partOfHost((await headers()).get('host'));
  if (part === 'admin') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/auth/'] },
    sitemap: `${part === 'journal' ? JOURNAL_URL : SITE_URL}/sitemap.xml`,
  };
}
