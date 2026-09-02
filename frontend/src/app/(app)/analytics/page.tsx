import { Suspense } from 'react';
import { AnalyticsPage } from '@/views/analytics/Page';

/**
 * Аналитика — /analytics (была «Выборка» на /lab)
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 *
 * Suspense здесь — не состояние ожидания (useLabFilters читает URL синхронно
 * на клиенте, реального асинхронного разрыва нет), а требование Next:
 * маршрут с useSearchParams вне Suspense не собирается статически. fallback
 * пустой — ждать нечего.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AnalyticsPage />
    </Suspense>
  );
}
