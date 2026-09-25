'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

/**
 * Нижний блок раздела: зачем игры собраны в одном месте и на одни монеты.
 *
 * Сюда же прокручивает кнопка «Как это работает» из героя — поэтому у секции
 * есть постоянный id.
 *
 * Картинка лежит фоном на всю полосу, а не картинкой справа: у ассета тёмный
 * левый край, и текст ложится прямо на него без подложки и затемнения. Четыре
 * шага (играй → расти → соревнуйся → зарабатывай) стоят столбцом в той самой
 * светящейся рамке, что нарисована на ассете: это порядок, и порядок должен
 * быть виден.
 */
export function PlatformBanner() {
  const t = useTranslations('games');
  const steps = t.raw('platform.steps') as string[];
  return (
    <section className="gplat" id="games-platform">
      <Image
        className="gplat-art"
        src="/assets/games/games-banner.webp"
        alt=""
        width={768}
        height={510}
        sizes="(max-width: 1000px) 100vw, 1360px"
      />
      <div className="gplat-txt">
        <p className="gkicker">{t('platform.kicker')}</p>
        <h2>{t('platform.title')}</h2>
        <p className="gplat-lede">{t('platform.lede')}</p>
      </div>
      <ol className="gplat-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
