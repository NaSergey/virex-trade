import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { PlanLayout } from '@/views/plan/Layout';

/** План дня — admin.<домен>/plan (весь раздел — views/plan). */
export const metadata: Metadata = {
  title: 'План',
  appleWebApp: { capable: true, title: 'План', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#050505', viewportFit: 'cover' };

export default function Layout({ children }: { children: ReactNode }) {
  return <PlanLayout>{children}</PlanLayout>;
}
