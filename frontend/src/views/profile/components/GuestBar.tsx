'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { TradePlayMark } from '@/shared/ui/TradePlayMark';

/**
 * Шапка гостя, открывшего профиль по ссылке: знак продукта и два входа —
 * «Войти» (с возвратом на этот же профиль) и «Создать аккаунт». Рейки
 * разделов у гостя нет: каждый её пункт привёл бы на страницу входа.
 *
 * Классы — те же, что у шапки приложения (`.top`, `.top-in`, `.mark`):
 * высота одна (`--top-h`), и профиль, стоящий ровно в экран, считает от неё.
 */
export function GuestBar() {
  const t = useTranslations('profile');
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="top top-game">
      <div className="top-in">
        <Link href="/" className="mark">
          <TradePlayMark width={46} height={28} />
        </Link>
        <span className="pf-guest-gap" />
        <div className="top-r pf-guest-r">
          <Button variant="bare" onClick={() => router.push(`/?auth=login&next=${encodeURIComponent(pathname)}`)}>
            {t('guestSignIn')}
          </Button>
          <Button variant="solid" onClick={() => router.push('/?auth=register')}>
            {t('guestSignUp')}
          </Button>
        </div>
      </div>
    </header>
  );
}
