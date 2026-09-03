'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { Wrap } from '@/shared/ui/Wrap';
import { PageHead } from '@/shared/ui/PageHead';
import { SectionHead } from '@/shared/ui/SectionHead';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Seg } from '@/shared/ui/Seg';
import { useAdminOverview, useAdminRetention } from './api/hooks';
import { Totals } from './components/Totals';
import { DailyChart } from './components/DailyChart';
import { Funnel } from './components/Funnel';
import { UsersTable } from './components/UsersTable';
import { Sections } from './components/Sections';
import { Retention } from './components/Retention';

const RETENTION_WEEKS = 8;

/**
 * Пользователи — раздел владельца сервиса: пользуются им или нет.
 *
 * Порядок разделов идёт от общего к частному: сначала свод и график по дням
 * (сколько людей вообще заходит), потом путь (докуда они доходят), потом
 * поимённый список, и только в конце — разрезы (разделы, удержание).
 *
 * Времени на сайте здесь нет ни в одной таблице. Приложение опрашивает API и с
 * фоновой вкладки, поэтому «минуты» означали бы время с открытой вкладкой, а не
 * время человека за экраном; вопрос «пользуются или нет» отвечают заходы, дни с
 * активностью и действия.
 *
 * Право на раздел проверяет бэкенд на каждом запросе (AdminGuard). Флаг isAdmin
 * здесь только для того, чтобы не показывать пустые таблицы и не стрелять
 * запросами, которые заведомо вернут 403.
 */
export function AdminPage() {
  const t = useTranslations('admin');
  const { user, loading } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [days, setDays] = useState(30);

  const { data: overview, isLoading, error } = useAdminOverview(days, isAdmin);
  const { data: retention, isLoading: retentionLoading } = useAdminRetention(
    RETENTION_WEEKS,
    isAdmin,
  );

  // Сессия ещё восстанавливается — про доступ пока ничего не известно, и
  // говорить «нельзя» рано: у страницы свои заглушки, их и показываем.
  if (!loading && !isAdmin) {
    return (
      <Wrap page>
        <EmptyState title={t('deniedTitle')}>{t('deniedBody')}</EmptyState>
      </Wrap>
    );
  }

  return (
    <Wrap page>
      <PageHead title={t('title')} lede={t('lede')}>
        <Seg
          options={[
            { value: 7, label: t('days7') },
            { value: 30, label: t('days30') },
            { value: 90, label: t('days90') },
          ]}
          value={days}
          onChange={setDays}
          ariaLabel={t('periodAria')}
        />
      </PageHead>

      <ErrorNote error={error} fallback={t('loadFailed')} />

      <Totals data={overview} isLoading={isLoading} />

      <SectionHead title={t('byDays')} style={{ marginTop: 'var(--s5)' }} />
      {overview ? <DailyChart daily={overview.daily} /> : null}

      <SectionHead title={t('path')} style={{ marginTop: 'var(--s5)' }}>
        <span className="lbl">{t('pathAllTime')}</span>
      </SectionHead>
      {overview ? <Funnel funnel={overview.funnel} /> : null}

      <SectionHead title={t('people')} style={{ marginTop: 'var(--s5)' }} />
      <UsersTable days={days} enabled={isAdmin} />

      <SectionHead title={t('bySections')} style={{ marginTop: 'var(--s5)' }} />
      <Sections rows={overview?.sections ?? []} isLoading={isLoading} />

      <SectionHead title={t('retention')} style={{ marginTop: 'var(--s5)' }}>
        <span className="lbl">{t('retentionWeeks', { n: RETENTION_WEEKS })}</span>
      </SectionHead>
      <Retention data={retention} isLoading={retentionLoading} />

      {/* Оговорки стоят под числами, а не в документации: «обращения» слишком
          легко прочитать как «действия», а визит — как факт из базы. Текст
          свой, а не из поля caveats ответа: сервер отдаёт его одной строкой
          по-русски, а страница двуязычная. */}
      <p className="muted" style={{ marginTop: 'var(--s5)' }}>
        {t('caveatVisit')} {t('caveatNoTime')} {t('caveatRequests')}
      </p>
    </Wrap>
  );
}
