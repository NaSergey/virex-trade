import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { SITE_URL } from '@/shared/config/site';
import { isAdminHost } from '@/shared/lib/utils/admin-host';

/**
 * Основной хост открыт целиком: закрытые страницы и так уводят гостя на главную,
 * а запрет здесь оставил бы их в выдаче голыми адресами. `/_next/` и `/assets/`
 * закрывать нельзя — без них поисковик не соберёт страницу. Поддомен админки
 * поисковику не нужен вовсе.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (isAdminHost((await headers()).get('host'))) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/auth/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
