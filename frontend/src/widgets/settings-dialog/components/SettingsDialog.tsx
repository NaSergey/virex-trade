'use client';

import { Fragment } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DEMO_EMAIL, useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { Dialog, DialogContent, DialogTitle, useDialogFade } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils/css';
import { SETTINGS_TABS, closeSettings, openSettings, useSettingsTab, type SettingsTab } from '../model/store';
import { ExchangeTab } from './ExchangeTab';
import { NotificationsTab } from './NotificationsTab';
import { ProfileTab } from './ProfileTab';

const TAB_LABEL: Record<SettingsTab, string> = {
  profile: 'tabProfile',
  exchange: 'tabExchange',
  notifications: 'tabNotifications',
};

/**
 * Окно настроек — одно на всё приложение (владелец 2026-10-17: «1 компонент
 * настроек с вкладками, как у доты; страницы не будет»). Стоит в `AppChrome`
 * и рисуется, пока хранилище говорит, какая вкладка открыта; открывают его
 * `openSettings(tab)`.
 */
export function SettingsHost() {
  const tab = useSettingsTab();
  return tab ? <SettingsDialog tab={tab} /> : null;
}

/**
 * Строка вкладок через «/» под шестерёнкой, разделы капсом с линейкой, строки
 * «подпись | значение» — по образцу окна настроек Доты. Размер окна постоянный:
 * смена вкладки не двигает его края, длинная вкладка листается внутри.
 */
function SettingsDialog({ tab }: { tab: SettingsTab }) {
  const t = useTranslations('settings');
  const { user } = useAuth();
  const { closing, close } = useDialogFade(closeSettings);
  const demo = user?.email === DEMO_EMAIL;

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent className="stg" aria-describedby={undefined}>
        <div className="stg-bar">
          <SettingsIcon className="stg-gear" size={18} aria-hidden />
          <DialogTitle className="stg-sr">{t('title')}</DialogTitle>
          <div className="stg-tabs" role="tablist" aria-label={t('title')}>
            {SETTINGS_TABS.map((id, i) => (
              <Fragment key={id}>
                {i > 0 && (
                  <span className="stg-sep" aria-hidden>
                    /
                  </span>
                )}
                <Button
                  variant="none"
                  role="tab"
                  aria-selected={tab === id}
                  className={cn('stg-tab', tab === id && 'is-on')}
                  onClick={() => openSettings(id)}
                >
                  {t(TAB_LABEL[id])}
                </Button>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="stg-body" role="tabpanel">
          {tab === 'profile' && <ProfileTab locked={demo} />}
          {tab === 'exchange' && <ExchangeTab />}
          {tab === 'notifications' && <NotificationsTab />}
        </div>
        <div className="stg-foot">
          <Button variant="solid" onClick={close}>
            {t('done')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
