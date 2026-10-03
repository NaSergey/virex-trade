'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';

/**
 * Что видит по ссылке тот, у кого нет аккаунта: приглашение, а не профиль
 * (решение владельца 2026-10-02 — «так и говорить: чтобы посмотреть профиль,
 * зарегистрируйтесь»).
 *
 * Это отмена прежнего решения (2026-10-01: «профиль по ссылке открывает и
 * гость, и видит всё»). Причина — на профиле теперь настоящие сделки: показать
 * их пользователям продукта и показать их любому, кто получил ссылку, — разные
 * решения.
 *
 * Редиректа на `/login` здесь нет намеренно: гость, пришедший по чужой ссылке,
 * не просил страницу входа, и выбросить его туда значило бы не ответить на то,
 * зачем он пришёл. Сама защита стоит не здесь, а на данных — `GET
 * /api/profile/:userId` требует входа, поэтому до этой страницы профиль не
 * доезжает в любом случае.
 */
export function GuestGate() {
  const t = useTranslations('profile');
  const router = useRouter();
  const pathname = usePathname();

  return (
    // `games-page` обязателен: заливка раздела (`GamesVeil`, `position: fixed`)
    // иначе накрыла бы собой текст — у неё свой слой.
    <div className="pf-gate games-page">
      <EmptyState title={t('gateTitle')}>{t('gateBody')}</EmptyState>
      <div className="pf-gate-do">
        <Button variant="solid" onClick={() => router.push('/login?mode=register')}>
          {t('guestSignUp')}
        </Button>
        <Button variant="bare" onClick={() => router.push(`/login?next=${encodeURIComponent(pathname)}`)}>
          {t('guestSignIn')}
        </Button>
      </div>
    </div>
  );
}
