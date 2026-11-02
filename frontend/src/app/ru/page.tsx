/**
 * Главная по-русски — /ru
 *
 * Та же страница, что `/`, но язык задан адресом (`proxy.ts`), а не кукой:
 * поисковик приходит без куки и по-другому русской версии не увидел бы.
 */
import { LANDING_PATH } from '@/shared/config/site';
import { LandingPage } from '@/views/landing/Page';
import { LandingJsonLd, landingMetadata } from '@/views/landing/seo';

export const generateMetadata = () => landingMetadata(LANDING_PATH.ru);

export default function Page() {
  return (
    <>
      <LandingJsonLd />
      <LandingPage />
    </>
  );
}
