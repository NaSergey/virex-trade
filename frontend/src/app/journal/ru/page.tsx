/**
 * Главная журнала по-русски — `journal.<домен>/ru`. Язык задан адресом (`proxy.ts`),
 * а не кукой: поисковик приходит без куки.
 */
import { LANDING_PATH } from '@/shared/config/site';
import { JournalLanding } from '@/views/landing/Page';
import { LandingJsonLd, landingMetadata } from '@/views/landing/seo';

export const generateMetadata = () => landingMetadata('journal', LANDING_PATH.ru);

export default function Page() {
  return (
    <>
      <LandingJsonLd part="journal" />
      <JournalLanding />
    </>
  );
}
