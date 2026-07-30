'use client';

import { useState } from 'react';
import { AuthGuard } from '@/shared/auth/AuthGuard';
import { TopNav, type Tab } from '@/shared/ui/TopNav';
import { OverviewPage } from '@/page/stats/OverviewPage';
import { TagsPage } from '@/page/stats/TagsPage';
import { LabPage } from '@/page/lab/Page';
import { AnalyticsPage } from '@/page/analytics/Page';
import { SettingsPage } from '@/page/settings/Page';

/**
 * Прокрутка — документа, а не внутренних панелей: страница-гроссбух кончается
 * там, где кончаются записи, и кривая может выйти в край вьюпорта (см. .bleed).
 * Своя область прокрутки у каждой панели этого не позволяла.
 */
function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <>
      <TopNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo(0, 0);
        }}
      />

      {activeTab === 'overview' && <OverviewPage />}
      {activeTab === 'tags' && <TagsPage />}
      {activeTab === 'analytics' && <AnalyticsPage />}
      {activeTab === 'lab' && <LabPage />}
      {activeTab === 'settings' && <SettingsPage />}
    </>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  );
}
