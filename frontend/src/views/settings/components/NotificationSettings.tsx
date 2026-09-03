'use client';

import { useTranslations } from 'next-intl';
import { Seg } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import {
  useNotifications,
  usePatchNotifications,
  type NotifItem,
} from '../api/notifications-hooks';

/**
 * Названия сигналов переводятся здесь по ключу, а не приходят готовыми с
 * бэкенда, — тот же приём, что у подсказок про права ключей: реестр на сервере
 * один и по-русски, а интерфейс двуязычный. Ключ, которого здесь ещё нет
 * (новый сигнал в реестре), откатывается на серверный заголовок как есть —
 * fallback, а не пустая строка.
 */
function useNotifTitle(): (key: string, fallback: string) => string {
  const t = useTranslations('settings');
  const titles: Record<string, string> = {
    'mkt.price1h': t('notifPrice1h'),
    'mkt.vol1h': t('notifVol1h'),
    'mkt.volume': t('notifVolume'),
    'mkt.fng': t('notifFng'),
    'mkt.ls': t('notifLs'),
    'mkt.book': t('notifBook'),
    'mkt.hour': t('notifHour'),
    'trade.opened': t('notifOpened'),
    'trade.closed': t('notifClosed'),
    'trade.overtrade': t('notifOvertrade'),
    'report.weekly': t('notifWeekly'),
    'sys.sync': t('notifSync'),
  };
  return (key, fallback) => titles[key] ?? fallback;
}

function useCategoryTitle(): (key: string, fallback: string) => string {
  const t = useTranslations('settings');
  const titles: Record<string, string> = {
    market: t('notifCatMarket'),
    trade: t('notifCatTrade'),
    report: t('notifCatReport'),
  };
  return (key, fallback) => titles[key] ?? fallback;
}

function SignalRow({
  item,
  index,
  onToggle,
  onPreset,
}: {
  item: NotifItem;
  index: number;
  onToggle: (enabled: boolean) => void;
  onPreset: (preset: number) => void;
}) {
  const t = useTranslations('settings');
  const title = useNotifTitle();

  return (
    <>
      <label className="opt" data-on={item.enabled} style={{ '--i': index } as React.CSSProperties}>
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        {/* Эмодзи с бэкенда здесь не рисуются: в чате они несут строку, а на
            листе, набранном моноширинным капсом, цветная картинка выбивается
            из типографики — и часть из них система подменяет чем попало. */}
        <span className="opt-n">{title(item.key, item.title)}</span>
      </label>
      {/* Порог показывается только у включённого сигнала: у выключенного он
          ничего не значит и только удлиняет список. */}
      {item.enabled && item.presets.length > 0 && (
        <div className="nt-th">
          <Seg
            options={item.presets.map((p, i) => ({ value: i, label: p.label }))}
            value={item.preset}
            onChange={onPreset}
            ariaLabel={t('notifThreshold')}
          />
        </div>
      )}
    </>
  );
}

/**
 * Настройка уведомлений. Единственное место, где эти переключатели живут:
 * панель в боте была снята, чтобы одно состояние не правилось из двух мест.
 */
export function NotificationSettings() {
  const t = useTranslations('settings');
  const { data, isLoading, error } = useNotifications();
  const patch = usePatchNotifications();
  const categoryTitle = useCategoryTitle();

  if (isLoading) return <Skeleton height={200} />;
  if (error || !data) return <ErrorNote error={error} fallback={t('loadFailed')} />;

  return (
    <>
      {data.categories.map((cat) => {
        const on = cat.items.filter((i) => i.enabled).length;
        return (
          <div key={cat.key}>
            <div className="nt-cat">
              <span className="lbl">{categoryTitle(cat.key, cat.title)}</span>
              <b>
                {on}/{cat.items.length}
              </b>
            </div>
            {cat.items.map((item, i) => (
              <SignalRow
                key={item.key}
                item={item}
                index={i}
                onToggle={(enabled) => patch.mutate({ items: { [item.key]: { enabled } } })}
                onPreset={(preset) => patch.mutate({ items: { [item.key]: { preset } } })}
              />
            ))}
          </div>
        );
      })}

      {/* Тихие часы — правило поверх всех сигналов, а не тринадцатый сигнал,
          поэтому стоят под списком и отбиты от него линейкой. */}
      <div className="nt-quiet">
        <label className="opt" data-on={data.quietHours}>
          <input
            type="checkbox"
            checked={data.quietHours}
            onChange={(e) => patch.mutate({ quietHours: e.target.checked })}
          />
          <span className="opt-n">{t('notifQuietHours')}</span>
        </label>
        <p className="foot">{t('notifQuietHoursHint')}</p>
      </div>
      {patch.error && <ErrorNote error={patch.error} fallback={t('loadFailed')} />}
    </>
  );
}
