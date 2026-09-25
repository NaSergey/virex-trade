'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Первый экран раздела: что здесь вообще происходит и куда нажать.
 *
 * Он занимает верхнюю треть страницы не ради красоты: витрина стоит в
 * продукте, где соседние разделы — журнал сделок и аналитика, и человек,
 * попавший сюда из «Бектеста», должен за секунду понять, что правила
 * сменились. Обычная `PageHead` с одной строкой лиды этого не делает.
 *
 * Главная кнопка ведёт в единственную написанную игру, а не на список: выбор
 * из одного — не выбор. Вторая кнопка никуда не уводит, а прокручивает к блоку
 * «одна платформа» — ответ на «как это работает» лежит на этой же странице, и
 * отдельная страница справки ради четырёх строк не нужна.
 *
 * Визуал — общий ассет раздела (четыре панели на одной платформе), а не рисунок
 * одной игры: показывать в герое одну игру значило бы обещать, что раздел про
 * неё. Грузится с `priority`: это первое, что видно на экране, и ленивая
 * загрузка здесь означала бы пустое место в момент захода.
 */
export function GamesHero({ playHref }: { playHref?: string }) {
  const t = useTranslations('games');
  return (
    <section className="ghero">
      <div className="ghero-txt">
        <p className="gkicker">{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className="ghero-tag">{t('tagline')}</p>
        <p className="ghero-lede">{t('lede')}</p>
        <div className="ghero-cta">
          {playHref && (
            <Link href={playHref} className="gbtn gbtn-solid">
              {t('start')} <span aria-hidden>→</span>
            </Link>
          )}
          <a href="#games-platform" className="gbtn gbtn-line">
            {t('how')}
          </a>
        </div>
      </div>

      <div className="ghero-art">
        <Image
          src="/assets/games/games-hero.webp"
          alt=""
          width={768}
          height={510}
          priority
          sizes="(max-width: 1000px) 96vw, 58vw"
        />
      </div>
      {/* Подпись вдоль правого края — та же мысль, что и в заголовке, но с
          другой стороны: игры разные, навык один. */}
      <p className="ghero-aside">{t('aside')}</p>
    </section>
  );
}
