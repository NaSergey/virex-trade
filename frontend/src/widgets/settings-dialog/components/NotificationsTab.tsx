'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Select } from '@/shared/ui/Field';
import { Skeleton } from '@/shared/ui/Skeleton';
import { useNotifications, usePatchNotifications, type NotifItem } from '../api/notifications';
import { useTelegramLink, useTelegramStatus, useTelegramTest, useTelegramUnlink } from '../api/telegram';
import { Hint, Row, Section } from './Rows';

/**
 * Названия сигналов переводятся здесь по ключу, а не приходят готовыми с
 * бэкенда: реестр на сервере один и по-русски, а интерфейс двуязычный. Ключ,
 * которого здесь ещё нет (новый сигнал в реестре), откатывается на серверный
 * заголовок как есть.
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

/**
 * Вкладка «Уведомления»: слева чат Telegram и тихие часы, справа сигналы по
 * разделам. Единственное место, где эти переключатели живут: панель в боте
 * снята, чтобы одно состояние не правилось из двух мест. Сигналы — только у
 * привязанного чата: без чата присылать их некуда.
 */
export function NotificationsTab() {
  const t = useTranslations('settings');
  const status = useTelegramStatus();
  const linked = status.data?.enabled && status.data.linked;
  return (
    <div className="stg-grid">
      <div className="stg-col">
        <TelegramSection />
        {linked && <QuietHours />}
      </div>
      {linked ? (
        <Signals />
      ) : (
        !status.isLoading && (
          <div className="stg-col stg-span2">
            <Hint>{t('notifNeedTelegram')}</Hint>
          </div>
        )
      )}
    </div>
  );
}

function TelegramSection() {
  const t = useTranslations('settings');
  const { data, isLoading } = useTelegramStatus();
  const link = useTelegramLink();
  const unlink = useTelegramUnlink();
  const test = useTelegramTest();

  return (
    <Section title={t('telegramTitle')}>
      {isLoading ? (
        <Skeleton height={60} flush />
      ) : !data?.enabled ? (
        <Hint>{t('telegramDisabled')}</Hint>
      ) : !data.linked ? (
        <>
          <Hint>{t('telegramNotLinked')}</Hint>
          {link.data?.url ? (
            <>
              {/* Обычная ссылка, а не Button: примитив рендерит только <button>. */}
              <a className="stg-link" href={link.data.url} target="_blank" rel="noreferrer">
                {t('telegramOpenBot')}
              </a>
              <Hint>{t('telegramLinkHint')}</Hint>
            </>
          ) : (
            <Button variant="solid" className="stg-wide" disabled={link.isPending} onClick={() => link.mutate()}>
              {t('telegramLinkAction')}
            </Button>
          )}
        </>
      ) : (
        <>
          <Hint>{t('telegramLinked')}</Hint>
          <div className="stg-btns">
            <Button disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isSuccess ? t('telegramTestSent') : t('telegramTest')}
            </Button>
            <Button disabled={unlink.isPending} onClick={() => unlink.mutate()}>
              {t('telegramUnlink')}
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

/** Тихие часы — правило поверх всех сигналов, а не тринадцатый сигнал. */
function QuietHours() {
  const t = useTranslations('settings');
  const id = useId();
  const { data } = useNotifications();
  const patch = usePatchNotifications();
  if (!data) return null;
  return (
    <Section title={t('notifQuietTitle')}>
      <Row label={t('notifQuietHours')} htmlFor={id} className="is-flag">
        <input
          id={id}
          type="checkbox"
          className="stg-check"
          checked={data.quietHours}
          onChange={(e) => patch.mutate({ quietHours: e.target.checked })}
        />
      </Row>
      <Hint>{t('notifQuietHoursHint')}</Hint>
    </Section>
  );
}

/**
 * Сигналы по разделам: первый раздел (рынок, самый длинный) — своей колонкой,
 * остальные — в третьей. Строка — галка с названием и порог списком: ряд
 * делений («> 20 за сутки» ×3) в трети окна рядом с названием не встаёт.
 */
function Signals() {
  const t = useTranslations('settings');
  const { data, isLoading, error } = useNotifications();
  const patch = usePatchNotifications();
  const categoryTitle = useCategoryTitle();

  if (isLoading) {
    return (
      <div className="stg-col stg-span2" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} height={30} flush />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="stg-col stg-span2">
        <ErrorNote error={error} fallback={t('loadFailed')} />
      </div>
    );
  }

  const [first, ...rest] = data.categories;
  const column = (cats: typeof data.categories) =>
    cats.map((cat) => (
      <Section
        key={cat.key}
        title={categoryTitle(cat.key, cat.title)}
        aside={`${cat.items.filter((i) => i.enabled).length}/${cat.items.length}`}
      >
        {cat.items.map((item) => (
          <SignalRow
            key={item.key}
            item={item}
            onToggle={(enabled) => patch.mutate({ items: { [item.key]: { enabled } } })}
            onPreset={(preset) => patch.mutate({ items: { [item.key]: { preset } } })}
          />
        ))}
      </Section>
    ));

  return (
    <>
      <div className="stg-col">{first && column([first])}</div>
      <div className="stg-col">
        {column(rest)}
        {patch.error && <ErrorNote error={patch.error} fallback={t('loadFailed')} />}
      </div>
    </>
  );
}

function SignalRow({
  item,
  onToggle,
  onPreset,
}: {
  item: NotifItem;
  onToggle: (enabled: boolean) => void;
  onPreset: (preset: number) => void;
}) {
  const t = useTranslations('settings');
  const title = useNotifTitle();
  return (
    <div className="stg-row">
      {/* Эмодзи с бэкенда не рисуются: в чате они несут строку, а здесь
          цветная картинка выбивается из типографики. */}
      <label className="stg-k opt" data-on={item.enabled}>
        <input type="checkbox" checked={item.enabled} onChange={(e) => onToggle(e.target.checked)} />
        <span className="opt-n">{title(item.key, item.title)}</span>
      </label>
      <div className="stg-v">
        {item.presets.length > 0 ? (
          // Порог у выключенного сигнала ничего не значит — список заперт.
          <Select
            aria-label={t('notifThreshold')}
            value={item.preset}
            disabled={!item.enabled}
            onChange={(e) => onPreset(Number(e.target.value))}
            full
          >
            {item.presets.map((p, i) => (
              <option key={p.value} value={i}>
                {p.label}
              </option>
            ))}
          </Select>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
    </div>
  );
}
