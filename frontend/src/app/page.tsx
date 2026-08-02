'use client';

import { useState } from 'react';
import { AuthGuard } from '@/features/auth';
import { TopNav, type Tab } from '@/widgets/top-nav';
// Слой страниц FSD лежит в src/views, а не src/pages: src/pages — служебный
// каталог Pages Router, и Next пытался собрать каждый файл оттуда как роут
// (сборка падала на «Property 'default' is missing»). App Router живёт в
// src/app, здесь — только его содержимое.
import { OverviewPage } from '@/views/overview/Page';
import { TagsPage } from '@/views/tags/Page';
import { LabPage } from '@/views/lab/Page';
import { AnalyticsPage } from '@/views/analytics/Page';
import { SettingsPage } from '@/views/settings/Page';

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
