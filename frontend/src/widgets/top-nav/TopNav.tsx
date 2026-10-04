'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useBattlePass } from '@/entities/battle-pass';
import { CoinBalance } from '@/entities/coins';
import { setClientTerminalHint, useTerminalAccess } from '@/entities/terminal';
import { DEMO_EMAIL, useAuth } from '@/features/auth';
import { DonateDialog } from '@/features/donation';
import { useOnboarding } from '@/features/onboarding';
import { ReferralDialog } from '@/features/referrals';
import { Button } from '@/shared/ui/Button';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { TradePlayMark } from '@/shared/ui/TradePlayMark';
import { useLocaleControl } from '@/shared/i18n';
import { isGamesDarkRoute } from '@/shared/lib/utils/games-dark-route';

type Tab = 'terminal' | 'overview' | 'tags' | 'analytics' | 'market' | 'backtest' | 'games' | 'settings' | 'admin';

type NavItem = { id: Tab; labelKey: Tab };

/**
 * Биржевой терминал — первым, перед «Обзором», и только у того, чей ключ
 * умеет ставить ордера (решение владельца 2026-09-30). В общем списке его нет:
 * пункт, обещающий торговлю ключу «только чтение», вёл бы на страницу отказа.
 */
const TERMINAL: NavItem = { id: 'terminal', labelKey: 'terminal' };

const NAV: NavItem[] = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'tags', labelKey: 'tags' },
  { id: 'analytics', labelKey: 'analytics' },
  { id: 'market', labelKey: 'market' },
  { id: 'backtest', labelKey: 'backtest' },
  { id: 'games', labelKey: 'games' },
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
export function TopNav({
  initialTerminal = false,
}: {
  /**
   * Был ли биржевой терминал доступен при последнем ответе — из куки, которую
   * читает серверный layout. Только подсказка первого кадра: как только придёт
   * ответ `useTerminalAccess`, решает он.
   */
  initialTerminal?: boolean;
}) {
  const { user, logout } = useAuth();
  const { restart } = useOnboarding();
  const t = useTranslations('nav');
  const to = useTranslations('onboarding');
  const { locale } = useLocaleControl();
  const pathname = usePathname();
  // Три состояния, а не флаг: закрытое меню ещё доигрывает анимацию ухода
  // ('closing'), и снять его с дерева сразу значило бы оборвать её первым
  // кадром. Повторное нажатие «Профиля» посреди ухода возвращает меню назад.
  const [menu, setMenu] = useState<'closed' | 'open' | 'closing'>('closed');
  const menuOpen = menu === 'open';
  const closeMenu = useCallback(() => setMenu((m) => (m === 'open' ? 'closing' : m)), []);
  // Награда, которой не видно, — не награда: точка на кнопке профиля
  // появляется, когда ждут либо уровни, либо сегодняшняя ежедневная.
  const battlePass = useBattlePass();
  const hasRewards = Boolean(
    battlePass.data && (battlePass.data.pendingCoins > 0 || !battlePass.data.daily.claimedToday),
  );
  // Пока ответа нет, рейка стоит так, как стояла при прошлом ответе
  // (`initialTerminal` — кука, прочитанная сервером): пункт есть уже в
  // присланной разметке, а не появляется после запроса, сдвигая остальные.
  const access = useTerminalAccess().data;
  // Демо-аккаунту терминал показывается всегда: у него нет ключа биржи, и
  // страница открывает тот же экран на симуляции (`DemoTerminal`).
  const demo = user?.email === DEMO_EMAIL;
  const hasTerminal = demo || (access ? access.available : initialTerminal);
  // Сервер про демо не знает и отвечает «доступа нет», а запрос доступа
  // переписывает этим ответом куку-подсказку первого кадра. Без перезаписи
  // следующая загрузка демо рисовала рейку без пункта и вставляла его через
  // долю секунды, сдвигая все разделы.
  useEffect(() => {
    if (demo && access) setClientTerminalHint(true);
  }, [demo, access]);
  const nav = hasTerminal ? [TERMINAL, ...NAV] : NAV;
  const [donateOpen, setDonateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // Ехать или встать молча: см. эффект ниже — подгонка под догрузившийся
  // шрифт не должна выглядеть переездом.
  const [moving, setMoving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  // Тёмные маршруты раздела игр (витрина, джетпак, сам стол) — шапка общая
  // снаружи них, и её полупрозрачная заливка берёт цвет темы: в светлой теме
  // читалась бы кремовым пятном поверх чёрного содержимого под ней. Лобби
  // столов и турниры сюда не входят — там обычная тема (`isGamesDarkRoute`).
  const inGames = isGamesDarkRoute(pathname);

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
      // Страницы вне рейки (`/settings`, `/profile`, `/admin`) не дают
      // активной ссылки — плашку тогда нужно спрятать, а не оставить от
      // прошлой страницы: иначе появление «Терминала» сдвигает рейку, а
      // плашка остаётся на координатах, снятых до сдвига, и повисает между
      // пунктами.
      if (!active) {
        setMoving(false);
        setIndicator(null);
        return;
      }
      setMoving(animated);
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };
    const settle = () => place(false);
    place(true);
    document.fonts?.ready?.then(settle);
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
    // `hasTerminal`: появившийся первым пункт сдвигает все остальные, и плашка
    // обязана переехать вместе со своим.
  }, [pathname, locale, hasTerminal]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen, closeMenu]);

  return (
    <header className={`top${inGames ? ' top-game' : ''}`}>
      <div className="top-in">
        <Link href="/overview" className="mark">
          <TradePlayMark width={46} height={28} />
        </Link>

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
          {nav.map((item) => (
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
          {/* Монеты — слева от переключателей и профиля: их тратят в играх, а
              баланс должен быть виден с любой страницы, не только из раздела. */}
          <CoinBalance onBuy={() => setDonateOpen(true)} />
          <ThemeToggle />
          <Button
            variant="none"
            className={`acct acct-av${hasRewards ? ' has-dot' : ''}`}
            aria-label={t('profile')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenu((m) => (m === 'open' ? 'closing' : 'open'))}
          >
            {/* Картинка профиля — не через next/image: адрес версионный и с
                кэшем на год, оптимизатору пришлось бы ходить за ней на API. */}
            {user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" />
            ) : (
              (user?.name || user?.email || '?').charAt(0).toUpperCase()
            )}
          </Button>
          {menu !== 'closed' && (
            <div
              className="acct-menu"
              role="menu"
              data-state={menu === 'closing' ? 'closed' : 'open'}
              // Меню снимается с дерева концом своей анимации ухода, а не
              // таймером: длительность живёт в одном месте — в стилях.
              // Анимации детей (тумблер языка) сюда тоже всплывают — их
              // отсекает сверка узла.
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) setMenu((m) => (m === 'closing' ? 'closed' : m));
              }}
            >
              {/* Кто вошёл — без подписей «кто» и «почта»: имя и адрес
                  узнаются сами, а подписи только удлиняли меню. */}
              <div className="acct-id">
                <div className="acct-name">{user?.name || t('noName')}</div>
                <div className="acct-mail">{user?.email}</div>
              </div>
              {/* Язык — свойство учётной записи, а не раздел сайта: в рейке
                  шапки он стоял наравне с «Обзором» и «Тегами», хотя ничего
                  не открывает. Здесь он рядом с именем и почтой — там, где
                  человек и ищет настройки своего профиля, — и заодно
                  освобождает узкую шапку на телефоне. */}
              <div className="acct-lang">
                <LocaleSwitch />
              </div>
              {/* Пункт меню — вся строка целиком, а не слово «Открыть» справа
                  от подписи: подпись и есть действие, и второе слово рядом с
                  ней только отодвигало цель от руки. */}
              <div className="acct-items">
                {/* Профиль — первым, выше настроек (решение владельца
                    2026-10-01): переход по адресу, а не окно. Кнопка меню
                    теперь кружок без подписи, и двух «Профилей» подряд нет. */}
                {/* Сразу на `/profile/<id>`, а не на `/profile`: адрес в
                    строке браузера и есть ссылка, которой делятся. */}
                <Link className="acct-item" href={user ? `/profile/${user.id}` : '/profile'} onClick={closeMenu}>
                  {t('battlePass')}
                </Link>
                {/* Настройки — сюда же, рядом с языком: оба пункта про учётную
                    запись и подключение к ней, а не про работу с журналом,
                    которой посвящена рейка разделов выше. */}
                <Link className="acct-item" href="/settings" onClick={closeMenu}>
                  {t('settings')}
                </Link>
                {/* Обучение здесь, а не в Настройках: туры идут по всем пяти
                    разделам, и вернуть их надо уметь с того раздела, где
                    застрял, а не сходив за этим на страницу ключей. */}
                <Button
                  variant="none"
                  className="acct-item"
                  onClick={() => {
                    closeMenu();
                    restart();
                  }}
                >
                  {to('menuLabel')}
                </Button>
                {/* Донат стоит здесь, а не в рейке разделов: рейка — это работа
                    с журналом, и просьба о деньгах в одном ряду со «Сделками»
                    торговалась бы за внимание с продуктом. В меню профиля она
                    находится тогда, когда человек её ищет.

                    Кнопка, а не ссылка, и это тот редкий случай, когда так и
                    надо: за ней нет раздела с адресом — за ней окно на два шага,
                    которое открывается поверх той страницы, где человек сейчас
                    работает, и закрывается обратно в неё. */}
                <Button
                  variant="none"
                  className="acct-item"
                  onClick={() => {
                    closeMenu();
                    setDonateOpen(true);
                  }}
                >
                  {t('support')}
                </Button>
                {/* Тот же приём, что у доната: пункт открывает окно поверх
                    текущей страницы, а не уводит на отдельный адрес. */}
                <Button
                  variant="none"
                  className="acct-item"
                  onClick={() => {
                    closeMenu();
                    setInviteOpen(true);
                  }}
                >
                  {t('referrals')}
                </Button>
                {/* Аналитика по пользователям сервиса — не раздел работы с
                    журналом, а инструмент владельца, тот же класс пунктов, что
                    донат и рефералы. В общей рейке разделов она обещала бы
                    доступ, которого у обычного пользователя нет; здесь её видно
                    только владельцу (`user.isAdmin`), и это тот редкий случай,
                    когда за пунктом — не окно, а обычный переход по адресу. */}
                {user?.isAdmin && (
                  <Link className="acct-item" href="/admin" onClick={closeMenu}>
                    {t('admin')}
                  </Link>
                )}
              </div>
              <Button
                variant="risk"
                className="acct-logout"
                onClick={() => {
                  closeMenu();
                  void logout();
                }}
              >
                {t('logout')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Окно живёт в шапке, а не в разделе: шапка есть на каждой странице
          продукта, и донат должен открываться поверх любой из них. */}
      <DonateDialog open={donateOpen} onClose={() => setDonateOpen(false)} />
      {user && (
        <ReferralDialog userId={user.id} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      )}
    </header>
  );
}

export type { Tab };
