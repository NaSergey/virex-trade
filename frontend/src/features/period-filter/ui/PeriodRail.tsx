'use client';

import { useTranslations } from 'next-intl';
import { PERIOD_VALUES } from '../model/usePeriodFilter';
import { Seg } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Input } from '@/shared/ui/Field';
import { formatPeriodRange } from '@/shared/lib/utils/period';
import { useLocaleControl } from '@/shared/i18n';

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Рейка периода: слева — за что именно посчитан свод (даты прописью и число
 * записей), справа — управление этим же периодом. Одна строка, а не две полосы:
 * фильтр и подпись говорят об одном и том же, и связь между ними доказывается
 * тем, что подпись меняется от нажатия соседней кнопки.
 *
 * Своя дата — обычное поле ввода, а не пилюля с календарём: дату быстрее
 * напечатать, а нативная иконка календаря у поля никуда не делась.
 *
 * Поле и пресеты не гасят друг друга: если своя дата уже введена, клик по
 * «30 дней» подсвечивает пресет и переключает на него подпись и запросы, но
 * саму дату из поля не убирает — она остаётся под рукой, если нужно вернуться.
 * Активность в интерфейсе показывает `customActive`, а не факт того, что поле
 * непустое.
 */
export function PeriodRail({
  title,
  days,
  customDate,
  customActive,
  trades,
  onSelectDays,
  onCustomDate,
}: {
  /** Что сводится: «Теги за период». Без него подпись слева — только счётчик. */
  title?: string;
  days: number;
  customDate: string | null;
  /** Своя дата сейчас управляет фильтром (а не просто стоит в поле). */
  customActive: boolean;
  /** Число записей в периоде; undefined — ещё не пришло. */
  trades?: number;
  onSelectDays: (days: number) => void;
  onCustomDate: (iso: string | null) => void;
}) {
  const t = useTranslations('period');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';

  const PERIOD_OPTIONS = PERIOD_VALUES.map((value) => ({
    value,
    label:
      value === 7 ? t('days7') : value === 30 ? t('days30') : value === 90 ? t('days90') : t('allTime'),
  }));

  const effectiveDays = customActive ? -1 : days;
  const range =
    customActive && customDate
      ? t('since', {
          date: new Date(customDate).toLocaleDateString(intlLocale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
        })
      : formatPeriodRange(days, intlLocale, t('allTimeLower'));

  return (
    <div className="strip-rail">
      <span className="ctx">
        {title && (
          <>
            {title} · <b>{range}</b>
            {' · '}
          </>
        )}
        {/* Пока числа нет — заглушка на его месте, а не пустота: счётчик стоит
            в одной строке с периодом, и появление цифры сдвигало бы уже
            прочитанную фразу. Ширина взята под трёхзначное число — самый
            частый случай, — так что подстановка почти не двигает хвост. */}
        {trades != null ? (
          <>
            <b>{trades}</b> {t('tradesSuffix')}
          </>
        ) : (
          <Skeleton as="span" inline flush height={9} width={72} />
        )}
      </span>
      <div className="period">
        <Input
          type="date"
          aria-label={t('startDate')}
          title={!customActive && customDate ? t('customDateSavedTitle') : undefined}
          className={!customActive && customDate ? 'inactive' : undefined}
          max={todayIso()}
          value={customDate ?? ''}
          onClick={() => {
            // Дата уже введена, но сейчас фильтром управляет пресет — клик по
            // полю возвращает её к управлению, без повторного набора. Если
            // пользователь кликнул, чтобы поменять дату, следующий же onChange
            // всё равно применит уже новое значение — этот клик тут не мешает.
            if (!customActive && customDate) onCustomDate(customDate);
          }}
          onChange={(e) => onCustomDate(e.target.value || null)}
        />
        <Seg options={PERIOD_OPTIONS} value={effectiveDays} onChange={onSelectDays} ariaLabel={t('periodAriaLabel')} />
      </div>
    </div>
  );
}
