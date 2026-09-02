'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { VirexLogo } from '@/shared/ui/VirexLogo';
import { Wrap } from '@/shared/ui/Wrap';

/** Разделы продукта — те же пять, что в рейке, минус Настройки: рассказывать про форму ключей нечего. */
const SECTIONS = ['overview', 'tags', 'analytics', 'market'] as const;

/** Шаги пути к своей системе — та же тройка, что на обложке обучения. */
const STEPS = [1, 2, 3] as const;

/**
 * Главная — единственная страница продукта, открытая тому, у кого ещё нет
 * аккаунта.
 *
 * Отвечает на один вопрос: зачем размечать свои сделки руками. Без ответа на
 * него продукт выглядит журналом, каких много, а половина его ценности как
 * раз в разметке — человек, не понявший этого на входе, бросит теги через
 * неделю.
 *
 * Обещания здесь ровно те, что подтверждены экранами: путь «найти —
 * проверить — сделать стабильным» и четыре раздела. Ограничения названы
 * вслух отдельным блоком, а не спрятаны: биржа живьём проверена одна, и
 * узнать об этом лучше до регистрации, чем после подключения ключей.
 *
 * Страница живёт вне группы `(app)`: у неё нет ни рейки разделов, ни защиты
 * сессии — вошедшего сюда не пускает `proxy.ts`, он уходит к своим сделкам.
 */
export function LandingPage() {
  const t = useTranslations('landing');

  return (
    <>
      <header className="lp-top">
        <Wrap>
          <div className="lp-top-in">
            <div className="mark">
              <VirexLogo width={30} height={30} />
              Virex
            </div>
            <div className="lp-top-r">
              <ThemeToggle />
              <LocaleSwitch className="seg-tight" />
              <Link href="/login" className="lp-login">
                {t('signIn')}
              </Link>
            </div>
          </div>
        </Wrap>
      </header>

      <main>
        <Wrap page>
          <section className="lp-hero">
            <h1>{t('heroTitle')}</h1>
            <p className="lp-lede">{t('heroLede')}</p>
            <div className="lp-cta">
              <Link href="/login?mode=register">
                <Button variant="solid">{t('ctaStart')}</Button>
              </Link>
              <span className="lp-note">{t('ctaNote')}</span>
            </div>
          </section>

          {/* Путь к своей системе. Тот же, что человек увидит первым шагом
              обучения внутри продукта: обещание на входе и первое, что он
              встретит внутри, обязаны совпадать дословно по смыслу. */}
          <section className="lp-sec">
            <h2>{t('stepsTitle')}</h2>
            <ol className="lp-steps">
              {STEPS.map((n) => (
                <li className="lp-step" key={n}>
                  <h3>{t(`step${n}Title`)}</h3>
                  <p>{t(`step${n}Body`)}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="lp-sec">
            <h2>{t('sectionsTitle')}</h2>
            <div className="lp-grid">
              {SECTIONS.map((id) => (
                <div className="lp-card" key={id}>
                  <h3>{t(`section_${id}_title`)}</h3>
                  <p>{t(`section_${id}_body`)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Ключи — единственное место, где продукт просит доверия, и потому
              единственное, о чём он говорит до того, как его спросят. */}
          <section className="lp-sec">
            <h2>{t('keysTitle')}</h2>
            <p className="lp-body">{t('keysBody')}</p>
          </section>

          {/* Честный блок. Стоит ДО регистрации намеренно: узнать про одну
              проверенную биржу после подключения ключей — узнать слишком
              поздно. */}
          <section className="lp-sec">
            <h2>{t('honestTitle')}</h2>
            <ul className="lp-honest">
              <li>{t('honest1')}</li>
              <li>{t('honest2')}</li>
              <li>{t('honest3')}</li>
            </ul>
          </section>

          <section className="lp-end">
            <h2>{t('endTitle')}</h2>
            <p className="lp-body">{t('endBody')}</p>
            <div className="lp-cta">
              <Link href="/login?mode=register">
                <Button variant="solid">{t('ctaStart')}</Button>
              </Link>
              <Link href="/login" className="lp-login">
                {t('signIn')}
              </Link>
            </div>
          </section>
        </Wrap>
      </main>

      <footer className="lp-foot">
        <Wrap>
          <span className="muted">{t('footer')}</span>
        </Wrap>
      </footer>
    </>
  );
}
