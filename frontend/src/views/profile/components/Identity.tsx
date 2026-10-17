'use client';

import { Settings as SettingsIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ProfileOverview } from '@/entities/profile';
import { useLocaleControl } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils/css';
import { dateFormat } from '@/shared/lib/utils/intl';
import { Button } from '@/shared/ui/Button';
import { ProfilePicture } from '@/shared/ui/ProfilePicture';
import { Tooltip } from '@/shared/ui/Tooltip';
import { openSettings } from '@/widgets/settings-dialog';
import { ACHIEVEMENT_ICONS, progressOf } from '../lib/achievements';

/**
 * Кто это: картинка профиля, дата регистрации, имя и ряд из двенадцати значков
 * достижений. Значки плоские — полученный цветом текста, остальные
 * приглушены; что за значок и сколько до него, говорит подсказка. На своём
 * профиле у правого края — шестерёнка: общее окно настроек на вкладке
 * «Профиль» (та же иконка, что у настроек графика терминала).
 */
export function Identity({ profile, own }: { profile: ProfileOverview; own: boolean }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const name = profile.user.name?.trim() || t('noName');
  const since = dateFormat(intlLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(profile.since),
  );
  const earned = profile.achievements.filter((a) => a.earned).length;

  return (
    <header className="pf-id">
      <div className="pf-ava" aria-hidden>
        <ProfilePicture src={profile.user.avatar} />
      </div>
      <div className="pf-id-t">
        <span className="lbl">{t('eyebrow', { date: since })}</span>
        <h1 className="pf-name" title={name}>
          {name}
        </h1>
        <ul className="pf-badges" aria-label={t('achievements')}>
          {profile.achievements.map((a) => {
            const Icon = ACHIEVEMENT_ICONS[a.id];
            const text = `${t(`ach.${a.id}.name`)}. ${t(`ach.${a.id}.desc`)}. ${a.earned ? t('achEarned') : progressOf(a)}`;
            return (
              <Tooltip key={a.id} text={text}>
                <li className={cn('pf-badge', a.earned && 'is-got')} tabIndex={0} aria-label={text}>
                  <Icon aria-hidden size={20} strokeWidth={1.75} />
                </li>
              </Tooltip>
            );
          })}
          <li className="pf-badges-n">{t('achCount', { got: earned, total: profile.achievements.length })}</li>
        </ul>
      </div>
      {own && (
        <Button
          variant="bare"
          tight
          className="pf-gear"
          aria-label={t('settingsOpen')}
          title={t('settingsOpen')}
          onClick={() => openSettings('profile')}
        >
          <SettingsIcon size={18} aria-hidden />
        </Button>
      )}
    </header>
  );
}
