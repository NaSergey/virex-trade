'use client';

import type { CSSProperties } from 'react';
import { GAMES } from '../model/games';

/**
 * Первый экран раздела — сцена над карточками. Вместе с карточками баннер
 * занимает ровно окно под шапкой (`.gfirst`) и забирает всё, что карточки
 * оставили.
 *
 * Над каждой карточкой висит софит в краске её игры: колонки софитов — та же
 * сетка, что у `.gcards`, поэтому луч падает ровно на свою карточку.
 * Наведение на карточку зажигает её луч и приглушает остальные (`:has` в
 * CSS) — прожектор на выбранную игру.
 *
 * Своей коробки у баннера нет — ни поля, ни рамки, ни обрезки по краю: лучи
 * идут от верха экрана сквозь него до карточек и уходят за их кромку. Коробка
 * резала свет о свой край (решение владельца 2026-10-01).
 *
 * Текста и кнопок нет (снято владельцем 2026-10-01): «Игры» и слоган
 * повторяли шапку, где раздел и так подсвечен, а карточки кликабельны сами.
 * Что встанет в баннер — реклама, анонс, прогресс игрока — открыто.
 */
export function GamesHero() {
  return (
    <section className="ghero" aria-hidden>
      <div className="ghero-rig">
        {GAMES.map((game) => (
          <div key={game.id} className="ghero-beam" style={{ '--beam': `var(--g-a-${game.accent})` } as CSSProperties}>
            <div className="ghero-breathe">
              <i className="ghero-cone" />
              <i className="ghero-pool" />
            </div>
            <div className="ghero-lit">
              <i className="ghero-cone" />
              <i className="ghero-pool" />
            </div>
            <i className="ghero-lamp" />
          </div>
        ))}
      </div>
    </section>
  );
}
