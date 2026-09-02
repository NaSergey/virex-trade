'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import { KeyValue, Lookup } from '@/shared/ui/Lookup';
import { SkeletonLines } from '@/shared/ui/Skeleton';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useAdminUser } from '../api/hooks';
import { sectionLabel } from './Sections';

/** Сколько последних заходов показывать: дальше это уже не «когда он был». */
const VISITS_SHOWN = 8;

/**
 * Раскрытая строка пользователя: состояние аккаунта, что он тут делал и когда
 * заходил в последние разы.
 *
 * Запрос живёт здесь, а не на странице, потому что LedgerTable рендерит
 * раскрытие только у открытой строки: свёрнутые строки не тянут по запросу
 * каждая.
 *
 * Четыре блока — каждый отдельным ребёнком .order-ctx, а не одной сеткой на
 * всё: .order-ctx это флекс, его дети растягиваются по высоте самого высокого,
 * и сетка `Lookup`, положенная в него напрямую, раздвигала свои строки на всю
 * эту высоту — пять пар занимали экран.
 *
 * Заходы перечислены временем начала и числом обращений — без «сколько
 * пробыл»: конец визита это последняя засечка, а не момент ухода, и разность
 * читалась бы как время на сайте, которого здесь намеренно нет.
 */
export function UserDetail({ userId, days }: { userId: string; days: number }) {
  const t = useTranslations('admin');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const { data, isLoading, error } = useAdminUser(userId, days);

  if (error) return <ErrorNote error={error} fallback={t('loadFailed')} />;
  if (isLoading || !data) return <SkeletonLines widths={[90, 70, 50]} />;

  const { user, totals, sections, visits } = data;
  const at = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(intlLocale, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <div className="order-ctx">
      <div>
        <span className="lbl">{t('dAccount')}</span>
        <Lookup one>
          <KeyValue label={t('dRegistered')}>{at(user.registeredAt)}</KeyValue>
          <KeyValue label={t('dFirstSeen')}>{at(user.firstSeenAt)}</KeyValue>
          <KeyValue label={t('dLastSeen')}>{at(user.lastSeenAt)}</KeyValue>
          <KeyValue label={t('dExchanges')} valueClassName="">
            {user.exchanges.length ? user.exchanges.map((e) => e.exchange).join(', ') : '—'}
          </KeyValue>
          <KeyValue label={t('dTelegram')} valueClassName="">
            {user.telegramLinked ? t('yes') : t('no')}
          </KeyValue>
        </Lookup>
      </div>

      <div>
        <span className="lbl">{t('dPeriod')}</span>
        <Lookup one>
          <KeyValue label={t('dVisits')}>{totals.visits}</KeyValue>
          <KeyValue label={t('dDaysActive')}>{totals.daysActive}</KeyValue>
          <KeyValue label={t('dActions')}>{totals.actions}</KeyValue>
          <KeyValue label={t('dTrades')}>{user.trades}</KeyValue>
          {/* Размеченные сделки — та самая половина ценности продукта, которую
              делают руками: это число говорит о вовлечённости больше, чем заходы. */}
          <KeyValue label={t('dTagged')}>
            {user.taggedTrades}
            <span className="muted"> / {user.tags}</span>
          </KeyValue>
        </Lookup>
      </div>

      <div>
        <span className="lbl">{t('dSections')}</span>
        <Lookup one>
          {sections.length === 0 && <span className="muted">{t('noSections')}</span>}
          {sections.map((s) => (
            <KeyValue key={s.section} label={sectionLabel(t, s.section)}>
              {s.requests}
            </KeyValue>
          ))}
        </Lookup>
      </div>

      <div>
        <span className="lbl">{t('dVisitsList')}</span>
        <Lookup one>
          {visits.length === 0 && <span className="muted">{t('noVisits')}</span>}
          {visits.slice(0, VISITS_SHOWN).map((v) => (
            <KeyValue key={v.startedAt} label={at(v.startedAt)}>
              {v.requests}
            </KeyValue>
          ))}
        </Lookup>
      </div>
    </div>
  );
}
