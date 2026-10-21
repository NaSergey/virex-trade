import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { EnglishLayout } from '@/views/english/Layout';

/**
 * Учебник английского — admin.<домен>/english (весь раздел — views/english).
 * Манифест — чтобы с телефона раздел ставился на главный экран приложением;
 * лежит в `/assets/`: остальные адреса поддомена переписываются в `/admin/*`.
 */
export const metadata: Metadata = {
  title: 'English',
  manifest: '/assets/english/manifest.webmanifest',
  icons: { apple: '/assets/english/icon-180.png' },
  appleWebApp: { capable: true, title: 'English', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#050505', viewportFit: 'cover' };

export default function Layout({ children }: { children: ReactNode }) {
  return <EnglishLayout>{children}</EnglishLayout>;
}
