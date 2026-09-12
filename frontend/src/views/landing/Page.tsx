'use client';

import { useTranslations } from 'next-intl';
import { Wrap } from '@/shared/ui/Wrap';
import { useLenis } from './lib/useLenis';
import { LandingHeader } from './components/LandingHeader';
import { ScrollProgress } from './components/ScrollProgress';
import { SceneBackground } from './components/SceneBackground';
import { HeroScene } from './components/HeroScene';
import { TickerRail } from './components/TickerRail';
import { StepsScene } from './components/StepsScene';
import { ProductDemoScene } from './components/ProductDemoScene';
import { TrustScene } from './components/TrustScene';
import { FinaleScene } from './components/FinaleScene';

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
 * Порядок страницы: обещание и кнопка в первом кадре → лента терминов → три
 * шага → сам продукт (единственная светлая полоса) → честно о состоянии →
 * финал. Кино перенесено с прокрутки на загрузку: прежняя главная просила
 * пять тысяч пикселей скролла прежде, чем назвать, чем она вообще является.
 *
 * Ни одна сцена больше не пинится и не скрабится. Липкое сделано `position:
 * sticky`, появление контента — разовым твином на входе (`lib/reveal.ts`), и
 * высоту документа не меняет ничто, кроме самого содержимого; отсюда
 * исчезли и разъезжающиеся границы соседних сцен, и оговорки про порядок
 * refresh у ScrollTrigger.
 *
 * Страница живёт вне группы `(app)`: у неё нет ни рейки разделов, ни защиты
 * сессии — вошедшего сюда не пускает `proxy.ts`, он уходит к своим сделкам.
 */
export function LandingPage() {
  const t = useTranslations('landing');
  useLenis();

  return (
    <>
      <a href="#content" className="ls-skip">
        {t('skipToContent')}
      </a>
      <ScrollProgress />
      <LandingHeader />
      <SceneBackground />

      {/* `ls-dark` на всём листе: лендинг не подчиняется теме продукта, а
          светлеет ровно там, где показывают сам продукт. */}
      <main className="ls-dark" id="content" tabIndex={-1}>
        <HeroScene />
        <TickerRail />
        <StepsScene />
        <ProductDemoScene />
        <TrustScene />
        <FinaleScene />
      </main>

      <footer className="lp-foot ls-dark">
        <Wrap>
          <span className="muted">{t('footer')}</span>
        </Wrap>
      </footer>
    </>
  );
}
