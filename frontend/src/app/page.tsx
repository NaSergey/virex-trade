/**
 * Главная — /
 *
 * Рассказ о продукте для того, у кого ещё нет аккаунта. Вошедший сюда не
 * попадает: `proxy.ts` уводит его к своим сделкам ещё на edge, поэтому
 * страница ничего не знает ни о сессии, ни о пользователе.
 *
 * Файл роута — только объявление адреса, сама страница живёт в слое `views`
 * (см. соседние роуты и причину в `src/views`).
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
