/**
 * Главная журнала — `journal.<домен>/`. Адрес `/` переписывают rewrites в
 * `next.config.ts`; прямой заход на `/journal` с площадки гейт уводит на настоящую.
 */
import { LANDING_PATH } from '@/shared/config/site';
import { LandingPage } from '@/views/landing/Page';
import { LandingJsonLd, landingMetadata } from '@/views/landing/seo';

export const generateMetadata = () => landingMetadata(LANDING_PATH.en);

export default function Page() {
  return (
    <>
      <LandingJsonLd />
      <LandingPage />
    </>
  );
}
