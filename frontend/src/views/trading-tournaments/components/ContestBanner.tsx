import type { ReactNode } from 'react';
import { ContestBannerScene } from './ContestBannerScene';

/**
 * Шапка страницы турниров: та же анимированная сцена свечей, что и на
 * карточке торговли на /games, растянутая на весь экран вместо `PageHead`.
 * Токены и keyframes (`.tscene`/`.tsc-*`) общие и не завязаны на
 * `.games-page` — сцена работает и вне раздела игр.
 *
 * Рендерится вне `<Wrap>` (см. Page.tsx) и сама уходит в оба края
 * вьюпорта — второе такое место в продукте после кривой P&L (`.bleed`,
 * `shared/ui/Wrap.tsx`). Текст внутри держит читательскую колонку через
 * `.cbanner-in`, тем же приёмом, что у `.top`/`.top-in` в шапке сайта:
 * полоса на весь экран, содержимое — по сетке.
 *
 * Фон и текст — на токенах `--g-*`, у которых нет светлого перевода: страница
 * листает обе темы продукта, а баннер обязан остаться тёмным в обеих, иначе
 * зарево и свечи, снятые под чёрное поле, потеряются на бумаге светлой темы.
 */
export function ContestBanner({
  title,
  lede,
  children,
}: {
  title: ReactNode;
  lede?: ReactNode;
  /** Управление страницей — как у PageHead, но поверх сцены, а не рядом. */
  children?: ReactNode;
}) {
  return (
    <section className="cbanner">
      <ContestBannerScene />
      <div className="cbanner-fade" aria-hidden />
      <div className="cbanner-scrim" aria-hidden />
      <div className="cbanner-in">
        <div className="cbanner-txt">
          <h1>{title}</h1>
          {lede != null && <p className="cbanner-lede">{lede}</p>}
        </div>
        {children && <div className="cbanner-cta">{children}</div>}
      </div>
    </section>
  );
}
