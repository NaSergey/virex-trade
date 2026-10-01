'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Первый экран раздела: что здесь вообще происходит и куда нажать.
 *
 * Баннер над карточками, без картинки: вместе с карточками он занимает ровно
 * окно под шапкой (`.gfirst`) и забирает всё, что карточки оставили (решение
 * владельца 2026-09-25). Большой герой с ассетом справа занимал треть
 * страницы, и карточки уходили под сгиб. Что будет в баннере кроме текста —
 * решается отдельно.
 *
 * Текст всё равно нужен: витрина стоит в продукте, где соседние разделы —
 * журнал сделок и аналитика, и человек, попавший сюда из «Бектеста», должен за
 * секунду понять, что правила сменились.
 *
 * Главная кнопка ведёт в первую написанную игру, а не на список. Вторая
 * никуда не уводит, а прокручивает к блоку «одна платформа» — ответ на «как
 * это работает» лежит на этой же странице.
 */
export function GamesHero({ playHref }: { playHref?: string }) {
  const t = useTranslations('games');
  return (
    <section className="ghero">
      <div className="ghero-txt">
        <p className="gkicker">{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className="ghero-tag">{t('tagline')}</p>
      </div>
      <div className="ghero-side">
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
    </section>
  );
}
