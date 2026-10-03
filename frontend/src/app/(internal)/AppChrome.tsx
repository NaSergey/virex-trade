import type { ReactNode } from 'react';
import { DailyRewardPrompt } from '@/features/daily-reward';
import { OnboardingProvider, TourOverlay } from '@/features/onboarding';
import { GamesVeil } from '@/widgets/games-veil';
import { TopNav } from '@/widgets/top-nav';

/**
 * Обвязка приложения вошедшего: заливка тёмных маршрутов, рейка разделов,
 * обучение и ежедневная награда. Одна на два макета — `(app)` (всё за
 * входом) и `(open)` (профиль по ссылке, когда его открыл вошедший): иначе
 * второй макет повторял бы этот слой за слоем и разошёлся бы с ним на первой
 * правке.
 *
 * Всё внутри читает сессию (баланс, Battle Pass, доступ к терминалу), поэтому
 * гостю эта обвязка не показывается вовсе: его запросы получали бы 401.
 */
export function AppChrome({ initialTerminal, children }: { initialTerminal: boolean; children: ReactNode }) {
  return (
    <OnboardingProvider>
      {/* Заливка тёмных маршрутов раздела игр — здесь, а не на каждой из
          страниц: один узел переживает переход между ними, и гаснет
          симметрично тому, как наливается (см. GamesVeil). */}
      <GamesVeil />
      <TopNav initialTerminal={initialTerminal} />
      {children}
      {/* Обучение — последним слоем и снаружи защиты: рейка, которую оно
          подсвечивает первым шагом, тоже стоит снаружи. Провайдер обнимает
          и её, потому что «Обучение заново» живёт в меню профиля. */}
      <TourOverlay />
      {/* Тоже снаружи защиты и тоже читает состояние Battle Pass, как и
          TopNav. */}
      <DailyRewardPrompt />
    </OnboardingProvider>
  );
}
