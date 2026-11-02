/**
 * Главная площадки — /
 *
 * Превью для того, у кого ещё нет аккаунта. Вошедший сюда не попадает: `proxy.ts`
 * уводит его на витрину игр ещё на edge, поэтому страница ничего не знает ни о
 * сессии, ни о пользователе.
 *
 * Файл роута — только объявление адреса, сама страница живёт в слое `views`
 * (см. соседние роуты и причину в `src/views`).
 */
import { LANDING_PATH } from '@/shared/config/site';
import { PlayLanding } from '@/views/landing/Page';
import { LandingJsonLd, landingMetadata } from '@/views/landing/seo';

export const generateMetadata = () => landingMetadata('play', LANDING_PATH.en);

export default function Page() {
  return (
    <>
      <LandingJsonLd part="play" />
      <PlayLanding />
    </>
  );
}
