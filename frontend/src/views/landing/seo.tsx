import type { Metadata } from 'next';
import { LANDING_PATH, SITE_NAME, SITE_URL } from '@/shared/config/site';
import { loadMessages } from '@/shared/i18n/load-messages';
import { getServerLocale } from '@/shared/i18n/server-locale';

/**
 * Главная для поисковика — единственные страницы, которым разрешена выдача
 * (корневой layout запрещает её всем остальным).
 *
 * canonical обязателен: гейт `proxy.ts` уводит гостя с любой закрытой страницы
 * на `/?auth=login&next=…`, и без него каждый такой адрес был бы копией главной.
 *
 * Только для серверных файлов роутов: читает `next/headers`.
 */
export async function landingMetadata(path: string): Promise<Metadata> {
  const locale = await getServerLocale();
  const { meta } = await loadMessages(locale);
  const image = `/assets/app/og-${locale}-v1.png`;
  return {
    title: meta.landingTitle,
    description: meta.landingDescription,
    robots: { index: true, follow: true },
    alternates: {
      canonical: path,
      languages: { en: LANDING_PATH.en, ru: LANDING_PATH.ru, 'x-default': LANDING_PATH.en },
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: path,
      locale: locale === 'ru' ? 'ru_RU' : 'en_US',
      title: meta.landingTitle,
      description: meta.landingDescription,
      images: [{ url: image, width: 1200, height: 630, alt: meta.landingTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.landingTitle,
      description: meta.landingDescription,
      images: [image],
    },
  };
}

/**
 * Название сайта и логотип в выдаче — по `WebSite` и `Organization`. Рейтингов и
 * цен здесь нет: отзывов у продукта нет, а выдуманные поисковик наказывает.
 */
export async function LandingJsonLd() {
  const locale = await getServerLocale();
  const { meta } = await loadMessages(locale);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', url: `${SITE_URL}/`, name: SITE_NAME, inLanguage: locale },
      {
        '@type': 'Organization',
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        logo: `${SITE_URL}/assets/app/icon-512.png`,
      },
      {
        '@type': 'WebApplication',
        url: `${SITE_URL}${LANDING_PATH[locale]}`,
        name: SITE_NAME,
        description: meta.landingDescription,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        inLanguage: locale,
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // `<` экранируется, чтобы текст не мог закрыть тег скрипта.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }}
    />
  );
}
