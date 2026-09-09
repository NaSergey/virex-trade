'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { Wrap } from '@/shared/ui/Wrap';
import { useLenis } from './lib/useLenis';
import { LandingHeader } from './components/LandingHeader';
import { IntroScene } from './components/IntroScene';
import { PromiseScene } from './components/PromiseScene';
import { StepsScene } from './components/StepsScene';
import { ProductDemoScene } from './components/ProductDemoScene';
import { TrustScene } from './components/TrustScene';
import { FinaleScene } from './components/FinaleScene';
import { SceneBackground } from './components/SceneBackground';
import './landing.css';

/**
 * Главная — единственная страница продукта, открытая тому, у кого ещё нет
 * аккаунта.
 *
 * Отвечает на один вопрос: зачем размечать свои сделки руками. Без ответа на
 * него продукт выглядит журналом, каких много, а половина его ценности как
 * раз в разметке — человек, не понявший этого на входе, бросит теги через
 * неделю.
 *
 * Обещания здесь ровно те, что подтверждены экранами: путь «найти —
 * проверить — сделать стабильным» и четыре раздела. Ограничения названы
 * вслух отдельным блоком, а не спрятаны: биржа живьём проверена одна, и
 * узнать об этом лучше до регистрации, чем после подключения ключей.
 *
 * Страница живёт вне группы `(app)`: у неё нет ни рейки разделов, ни защиты
 * сессии — вошедшего сюда не пускает `proxy.ts`, он уходит к своим сделкам.
 */
export function LandingPage() {
  const t = useTranslations('landing');
  const lightLayerRef = useRef<HTMLDivElement>(null);
  const darkTopLayerRef = useRef<HTMLDivElement>(null);
  useLenis();

  return (
    <>
      <a href="#promise-scene" className="ls-skip">
        {t('skipToContent')}
      </a>
      <LandingHeader />
      <SceneBackground lightRef={lightLayerRef} darkTopRef={darkTopLayerRef} />

      <main>
        <IntroScene lightLayerRef={lightLayerRef} />
        <PromiseScene />
        <StepsScene />
        <ProductDemoScene />
        <TrustScene />
        <FinaleScene darkLayerRef={darkTopLayerRef} />
      </main>

      {/* `ls-dark` — потому что история заканчивается тёмной: без палитры сцены
          футер брал бы чернила реальной темы поверх фона финала и в светлой
          теме продукта читался бы почти никак. */}
      <footer className="lp-foot ls-dark">
        <Wrap>
          <span className="muted">{t('footer')}</span>
        </Wrap>
      </footer>
    </>
  );
}
