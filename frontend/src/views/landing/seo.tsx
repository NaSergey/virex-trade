import type { Metadata } from 'next';
import { JOURNAL_URL, LANDING_PATH, SITE_NAME, SITE_URL } from '@/shared/config/site';
import { loadMessages } from '@/shared/i18n/load-messages';
import { getServerLocale } from '@/shared/i18n/server-locale';

/** Части продукта со своей главной: площадка на главном домене и журнал на `journal.*`. */
type LandingPart = 'play' | 'journal';

/**
 * Главная для поисковика — единственные страницы, которым разрешена выдача
 * (корневой layout запрещает её всем остальным). Адреса относительные: их достраивает
 * `metadataBase` своей части в корневом layout.
 *
 * canonical обязателен: гейт `proxy.ts` уводит гостя с любой закрытой страницы
 * на `/?auth=login&next=…`, и без него каждый такой адрес был бы копией главной.
 *
 * Только для серверных файлов роутов: читает `next/headers`.
 */
export async function landingMetadata(part: LandingPart, path: string): Promise<Metadata> {
  const locale = await getServerLocale();
  const { meta } = await loadMessages(locale);
  const texts =
    part === 'journal'
      ? { title: meta.landingTitle, description: meta.landingDescription, image: `/assets/app/og-${locale}-v1.png` }
      : {
          title: meta.playLandingTitle,
          description: meta.playLandingDescription,
          image: `/assets/app/og-play-${locale}-v1.png`,
        };
  return {
    title: texts.title,
    description: texts.description,
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
      title: texts.title,
      description: texts.description,
      images: [{ url: texts.image, width: 1200, height: 630, alt: texts.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: texts.title,
      description: texts.description,
      images: [texts.image],
    },
  };
}

/**
 * Название сайта и логотип в выдаче — по `WebSite` и `Organization`. Рейтингов и
 * цен здесь нет: отзывов у продукта нет, а выдуманные поисковик наказывает.
 */
export async function LandingJsonLd({ part }: { part: LandingPart }) {
  const locale = await getServerLocale();
  const { meta } = await loadMessages(locale);
  const journal = part === 'journal';
  const base = journal ? JOURNAL_URL : SITE_URL;
  const name = journal ? `${SITE_NAME} Journal` : SITE_NAME;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', url: `${base}/`, name, inLanguage: locale },
      {
        '@type': 'Organization',
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        logo: `${SITE_URL}/assets/app/icon-512.png`,
      },
      {
        '@type': 'WebApplication',
        url: `${base}${LANDING_PATH[locale]}`,
        name,
        description: journal ? meta.landingDescription : meta.playLandingDescription,
        applicationCategory: journal ? 'FinanceApplication' : 'GameApplication',
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
