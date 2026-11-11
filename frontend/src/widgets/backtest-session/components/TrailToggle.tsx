'use client';

import { useTranslations } from 'next-intl';

/**
 * Переключатель «Подводящий» у стопа: маленькая кнопка в стиле вкладок панели —
 * включённая заливается, как выбранная вкладка. Не чекбокс: браузерный квадрат
 * выбивался из интерфейса и в шапке поля читался отдельной строкой.
 */
export function TrailToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations('backtest');
  return (
    <button type="button" className="trail-chip" aria-pressed={on} title={t('trailHint')} onClick={() => onChange(!on)}>
      {t('trail')}
    </button>
  );
}
