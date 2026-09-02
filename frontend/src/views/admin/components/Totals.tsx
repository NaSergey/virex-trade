'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@/shared/ui/Skeleton';
import { KeyValue, Lookup } from '@/shared/ui/Lookup';
import type { AdminOverview } from '../api/hooks';

/**
 * Свод раздела — девять величин одной строкой, той же раскладкой, что свод
 * «Обзора» (.metrics ровно на девять ячеек: на узком экране это 3×3 без сирот).
 *
 * Времени на сайте среди них нет и не будет: приложение опрашивает API и с
 * фоновой вкладки, поэтому «минуты» означали бы время с открытой вкладкой, а не
 * время человека за экраном. Здесь считается посещение — заходы, обращения и
 * действия.
 */
export function Totals({ data, isLoading }: { data?: AdminOverview; isLoading?: boolean }) {
  const t = useTranslations('admin');

  const cells: { label: string; value: number | undefined; title?: string }[] = [
    { label: t('mUsers'), value: data?.totals.users },
    { label: t('mNew'), value: data?.totals.newUsers },
    { label: t('mActive'), value: data?.totals.activeUsers },
    { label: t('mVisits'), value: data?.totals.visits, title: t('mVisitsTitle') },
    { label: t('mRequests'), value: data?.totals.requests, title: t('mRequestsTitle') },
    { label: t('mActions'), value: data?.totals.actions, title: t('mActionsTitle') },
    { label: 'DAU', value: data?.audience.dau, title: t('mDauTitle') },
    { label: 'WAU', value: data?.audience.wau, title: t('mWauTitle') },
    { label: 'MAU', value: data?.audience.mau, title: t('mMauTitle') },
  ];

  return (
    <>
      <div className="metrics">
        {cells.map((c) => (
          <div className="mcell" key={c.label} title={c.title}>
            <span className="lbl">{c.label}</span>
            <span className="mval">
              {c.value == null ? <Skeleton as="span" flush height={11} width="52%" /> : c.value}
            </span>
            {/* третья строка сетки .mcell — под шкалу; здесь шкал нет */}
            <span />
          </div>
        ))}
      </div>

      {/* Производные величины — справкой, а не в своде: они читаются только
          вместе со своими знаменателями и в строке крупных чисел спорили бы с
          ними за внимание. */}
      <Lookup style={{ marginTop: 'var(--s3)' }}>
        <KeyValue label={t('kVisitsPerUser')}>
          {fmt(data?.totals.avgVisitsPerActiveUser, isLoading)}
        </KeyValue>
        <KeyValue label={t('kDaysPerUser')}>
          {fmt(data?.totals.avgDaysActivePerUser, isLoading)}
        </KeyValue>
        <KeyValue label={t('kAvgDau')}>{fmt(data?.audience.avgDailyActiveUsers, isLoading)}</KeyValue>
        <KeyValue label={t('kStickiness')}>{fmt(data?.audience.stickiness, isLoading)}</KeyValue>
      </Lookup>
    </>
  );
}

function fmt(value: number | undefined, isLoading?: boolean) {
  if (value == null) return isLoading ? <Skeleton as="span" inline height={11} width={40} /> : '—';
  return value;
}
