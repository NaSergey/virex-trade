'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/features/auth';
import { useOnboarding } from '@/features/onboarding';
import { Button } from '@/shared/ui/Button';
import { KeyValue } from '@/shared/ui/Lookup';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { VirexLogo } from '@/shared/ui/VirexLogo';
import { useLocaleControl } from '@/shared/i18n';

type Tab = 'overview' | 'tags' | 'analytics' | 'market' | 'settings' | 'admin';

type NavItem = { id: Tab; labelKey: Tab; ownerOnly?: boolean };

const NAV: NavItem[] = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'tags', labelKey: 'tags' },
  { id: 'analytics', labelKey: 'analytics' },
  { id: 'market', labelKey: 'market' },
  { id: 'settings', labelKey: 'settings' },
  // Аналитика по пользователям сервиса. Стоит последней и видна только
  // владельцу: остальным ссылка вернула бы 403, а пункт в рейке обещал бы
  // раздел, которого у них нет.
  { id: 'admin', labelKey: 'admin', ownerOnly: true },
];

/**
 * Открыт ли этот раздел сейчас.
 *
 * Не строгое равенство: у раздела могут появиться вложенные адреса
 * (`/tags/<id>`), и пункт обязан оставаться подсвеченным внутри своей ветки.
 * Граница проверяется по слэшу, иначе `/lab` подсвечивался бы на `/labels`.
 */
const isActive = (pathname: string, id: Tab) => pathname === `/${id}` || pathname.startsWith(`/${id}/`);

/**
 * Разделы стоят горизонтальной рейкой в шапке, а не колонкой сбоку: страницы
 * этого продукта — таблицы и кривые, им нужна вся ширина листа, а 232px
 * сайдбара отгрызали её на каждом экране. Активный раздел показан инверсной
 * плашкой — в системе, где цвет означает только деньги, «активно» нельзя
 * покрасить, его можно только вывернуть.
 *
 * Пункты — ссылки, а не кнопки, и это не косметика: у раздела есть адрес, и
 * рейка обязана его отдавать. Ссылку открывают в новой вкладке средней
 * кнопкой, кладут в закладки и видят в строке браузера, куда попали; кнопка не
 * умеет ничего из этого. Заодно роутер сам качает код раздела заранее, как
 * только пункт попал в поле зрения, — предзагружать его руками по наведению
 * больше не нужно.
 *
 * Какой раздел открыт, рейка узнаёт из адреса, а не из пропа: адрес и есть
 * единственный источник этого знания, и передавать его сверху значило бы
 * завести второй, способный с ним разойтись.
 */
export function TopNav() {
  const { user, logout } = useAuth();
  const { restart } = useOnboarding();
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const to = useTranslations('onboarding');
  const { locale } = useLocaleControl();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // Ехать или встать молча: см. эффект ниже — подгонка под догрузившийся
  // шрифт не должна выглядеть переездом.
  const [moving, setMoving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // На узком экране разделы стоят рейкой, которая листается вбок, и выбранный
  // может оказаться за её краем — после перезагрузки страницы или перехода не
  // мышью. Рейка подводит его к себе сама; block: 'nearest' держит при этом
  // вертикальную прокрутку страницы на месте.
  useEffect(() => {
    const active = navRef.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [pathname]);

  /*
   * Плашка активного раздела едет по рейке, а не перескакивает: её left/width
   * снимаются с самого активного пункта, а не считаются заранее, — тогда она
   * не может разойтись с тем, что реально на экране, даже когда подпись
   * меняет длину при смене языка. useLayoutEffect, а не useEffect: позиция
   * готова до отрисовки кадра, и при заходе на страницу плашка не дёргается
   * из нуля в исходную точку на глазах.
   *
   * Переезд анимируется, ПОДГОНКА — нет, и это разные события.
   *
   * Шрифт рейки — веб-шрифт с `display: swap`: первые кадры подписи набраны
   * запасным, и ширины у них другие. Первое измерение снимает ширину с
   * запасного, а `document.fonts.ready`後 — с настоящего. Пока оба меняли
   * плашку одинаково, при каждой перезагрузке страницы она на глазах
   * доезжала до чуть большей ширины: человек видел два состояния подряд без
   * единой на то причины. Подгонка теперь ставит размер молча, а ехать
   * плашке есть куда только при смене раздела.
   */
  useLayoutEffect(() => {
    const place = (animated: boolean) => {
      const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      setMoving(animated);
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };
    const settle = () => place(false);
    place(true);
    document.fonts?.ready?.then(settle);
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
  }, [pathname, locale]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  return (
    <header className="top">
      <div className="top-in">
        <div className="mark">
          <VirexLogo width={30} height={30} />
          Virex
        </div>

        {/* role="tablist" здесь больше нет: вкладки не меняют адрес, а эти
            пункты меняют. Скринридер должен услышать навигацию по разделам
            сайта, а не переключатель панелей внутри одной страницы. */}
        <nav className="nav" aria-label={t('sections')} ref={navRef} data-tour="nav">
          {/* Сама плашка активного раздела — общий слой под текстом ссылок, а
              не фон отдельной ссылки: так у неё есть что ехать, а не только
              где появляться. Первый кадр без indicator её не рисует вовсе —
              нечем дёрнуть из нуля, пока useLayoutEffect не снял реальные
              left/width с уже отрисованной активной ссылки. */}
          {indicator && (
            <span
              className={`nav-indicator${moving ? ' is-moving' : ''}`}
              // Место и размер — одним transform по единичной ширине, а не
              // left/width: те пересчитывают раскладку на каждом кадре
              // перехода, и рейка от этого заметно подтормаживала при смене
              // раздела. Плашка — сплошная заливка без содержимого, растянуть
              // её масштабом нечему повредить.
              style={{ transform: `translateX(${indicator.left}px) scaleX(${indicator.width})` }}
              aria-hidden
            />
          )}
          {NAV.filter((item) => !item.ownerOnly || user?.isAdmin).map((item) => (
            <Link
              key={item.id}
              href={`/${item.id}`}
              aria-current={isActive(pathname, item.id) ? 'page' : undefined}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="top-r" ref={menuRef}>
          <ThemeToggle />
          <Button
            variant="none"
            className="acct"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {t('profile')}
          </Button>
          {menuOpen && (
            <div className="acct-menu" role="menu">
              <KeyValue label={t('who')}>{user?.name || t('noName')}</KeyValue>
              <KeyValue label={t('email')}>{user?.email}</KeyValue>
              {/* Язык — свойство учётной записи, а не раздел сайта: в рейке
                  шапки он стоял наравне с «Обзором» и «Тегами», хотя ничего
                  не открывает. Здесь он рядом с именем и почтой — там, где
                  человек и ищет настройки своего профиля, — и заодно
                  освобождает узкую шапку на телефоне. */}
              <KeyValue label={tc('language')} control valueClassName="">
                <LocaleSwitch />
              </KeyValue>
              {/* Обучение здесь, а не в Настройках: туры идут по всем пяти
                  разделам, и вернуть их надо уметь с того раздела, где
                  застрял, а не сходив за этим на страницу ключей. */}
              <KeyValue label={to('menuLabel')} control valueClassName="">
                <Button
                  variant="bare"
                  onClick={() => {
                    setMenuOpen(false);
                    restart();
                  }}
                >
                  {to('menuAction')}
                </Button>
              </KeyValue>
              {/* Донат стоит здесь, а не в рейке разделов: рейка — это работа
                  с журналом, и просьба о деньгах в одном ряду со «Сделками»
                  торговалась бы за внимание с продуктом. В меню профиля она
                  находится тогда, когда человек её ищет. */}
              <KeyValue label={t('support')} control valueClassName="">
                <Link href="/support" onClick={() => setMenuOpen(false)}>
                  {tc('open')}
                </Link>
              </KeyValue>
              <Button
                variant="risk"
                style={{ marginTop: 'var(--s3)', width: '100%' }}
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                {t('logout')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export type { Tab };
