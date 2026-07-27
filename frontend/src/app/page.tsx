'use client';

import { useState } from 'react';
import { AuthGuard } from '@/shared/auth/AuthGuard';
import { Sidebar, type Tab } from '@/shared/ui/Sidebar';
import { OverviewPage } from '@/page/stats/OverviewPage';
import { TagsPage } from '@/page/stats/TagsPage';
import { LabPage } from '@/page/lab/Page';
import { AnalyticsPage } from '@/page/analytics/Page';
import { SettingsPage } from '@/page/settings/Page';

function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="grid h-screen w-screen grid-cols-[232px_1fr] overflow-hidden bg-app">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="min-h-0 min-w-0">
        {activeTab === 'overview' && <OverviewPage />}
        {activeTab === 'tags' && <TagsPage />}
        {activeTab === 'analytics' && <AnalyticsPage />}
        {activeTab === 'lab' && <LabPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  );
}
