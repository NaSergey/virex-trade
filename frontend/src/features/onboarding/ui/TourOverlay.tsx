'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { VirexLogo } from '@/shared/ui/VirexLogo';
import { useOnboarding } from '../model/OnboardingContext';
import { useAnchorRect, useIsNarrow, useViewport, type AnchorRect } from '../model/useAnchorRect';

/**
 * Затемнение с дыркой под объясняемым элементом и карточка с текстом рядом.
 *
 * Внешняя часть решает, идёт ли обучение вообще; внутренняя (`TourRun`)
 * живёт ВСЁ время тура и переживает смену шагов. Ремонтировать её на каждый
 * шаг нельзя: вместе с ней пересоздавалось бы затемнение, а оно на весь тур
 * одно — см. `TourRun`.
 */
export function TourOverlay() {
  const { active, prompt } = useOnboarding();
  if (active) return <TourRun />;
  // Вопрос — один на весь продукт (см. OnboardingContext), поэтому под
  // ключом здесь не раздел, а сам факт «есть что спросить»: карточка не
  // должна ремонтироваться каждый раз, когда `prompt` меняет, у ЧЬЕГО именно
  // раздела он взял текст-заглушку для `key` эффекта фокуса.
  if (prompt) return <TourAsk key="ask" />;
  return null;
}

/**
 * «Пройти обучение?» — вопрос-развилка перед самим туром, один на всё
 * обучение продукта, а не на каждый раздел по отдельности.
 *
 * Раньше первый шаг первого встреченного тура и был этим вопросом:
 * молчаливым автозапуском без возможности отказаться, не отметив тур
 * пройденным. Здесь решение явное, разовое и общее — «нет» гасит все пять
 * туров сразу, а не только тот, что случайно нарвался на вопрос первым;
 * «да» запускает тур этой страницы и разрешает остальным стартовать самим
 * при заходе, без повторных вопросов. Вернуть обучение после «нет» можно
 * через «Обучение заново» в меню профиля.
 */
function TourAsk() {
  const { startTour, declineTour } = useOnboarding();
  const t = useTranslations('onboarding');
  const title = t('askTitle');
  const start = useRef<HTMLButtonElement>(null);

  // Тот же приём, что у кнопки продвижения в самом туре: фокус на
  // рекомендованный ответ, чтобы Enter/Space сразу начинали обучение.
  useEffect(() => {
    start.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <Scrim rect={null} />
      <div
        className="tour-card tour-center"
        role="dialog"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') declineTour();
        }}
      >
        <div className="tc-h tc-h-logo">
          <h3>{title}</h3>
          <VirexLogo className="tc-logo" aria-hidden />
        </div>
        <p className="tc-b">{t('askBody')}</p>
        <div className="tc-f">
          <Button variant="bare" onClick={declineTour}>
            {t('askDecline')}
          </Button>
          <span className="tc-sp" />
          <Button variant="solid" ref={start} onClick={startTour}>
            {t('askStart')}
          </Button>
        </div>
      </div>
    </>
  );
}

/** Зазор между панелью и подсвеченным элементом. */
const GAP = 10;
/** Насколько близко к краю окна панели позволено подойти. */
const EDGE = 16;

/**
 * Куда встать панели: под якорем, над ним или по центру экрана.
 *
 * Считается здесь, а не библиотекой попапов, ради переезда. Попап
 * пересчитывает своё место мгновенно и в своих координатах — панель от шага
 * к шагу телепортировалась. Собственные координаты во вьюпорте кладутся в
 * один `transform`, а его CSS умеет вести плавно.
 */
function place(
  rect: AnchorRect | null,
  card: { w: number; h: number },
  view: { w: number; h: number },
): { x: number; y: number } {
  // Шагу без якоря подсвечивать нечего — панель идёт в центр экрана.
  if (!rect) {
    return { x: Math.round((view.w - card.w) / 2), y: Math.round((view.h - card.h) / 2) };
  }

  const x = Math.max(EDGE, Math.min(rect.x, view.w - card.w - EDGE));

  const below = rect.y + rect.height + GAP;
  const above = rect.y - card.h - GAP;
  let y = below;
  if (below + card.h > view.h - EDGE) {
    // Под элементом не помещается — становимся над ним. Если и там места
    // нет (элемент во весь экран), прижимаемся к ближайшему краю: накрыть
    // часть подсветки лучше, чем уехать за границу окна целиком.
    y = above >= EDGE ? above : Math.max(EDGE, view.h - card.h - EDGE);
  }

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Идущий тур: одно затемнение на всё обучение и карточка текущего шага.
 *
 * Затемнение вынесено сюда, а не в шаг, и это половина лечения мигания. Пока
 * шаг монтировался заново (`key`), вместе с ним пересоздавалось и затемнение:
 * оно пропадало и заново проигрывало своё проявление на КАЖДОМ нажатии
 * «Далее». Здесь оно монтируется один раз за тур, а от шага к шагу у него
 * меняется только дырка. Вторая половина — в `useAnchorRect`: узел, который
 * уже в документе, измеряется сразу, без промежуточного «ищу», не рисующего
 * вообще ничего.
 *
 * Ремонтирование по ключу осталось у КАРТОЧКИ: её эффект ставит фокус на
 * кнопку продвижения и обязан отработать заново на каждом шаге.
 */
function TourRun() {
  const { active, next, prev, dismiss, skipStep } = useOnboarding();
  const t = useTranslations('onboarding');
  const step = active ? active.tour.steps[active.step] : undefined;
  const anchor = useAnchorRect(step?.anchor);
  const narrow = useIsNarrow();
  const view = useViewport();
  const panel = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Панель едет только со второго места: на первое она обязана встать сразу,
  // иначе поедет из угла экрана, где её ещё не измерили.
  const [moves, setMoves] = useState(false);

  /*
   * Размер панели меняется вместе с текстом шага, и от него зависит, влезет
   * ли она под якорь. `ResizeObserver` на ней самой ловит это без единого
   * предположения о длине текстов.
   *
   * Зависимости — не пустые, и это не перестраховка. Панели в разметке нет,
   * пока ищется якорь, а на Настройках первый же шаг ждёт форму ключей: она
   * приезжает ответом сервера. С пустыми зависимостями наблюдатель ставился
   * один раз, на узел, которого ещё не было, и больше не пробовал: размер
   * навсегда оставался нулевым, панель — прозрачной, и от подсказки на
   * странице было одно выделение. `narrow` здесь по той же причине: под
   * листом снизу узла с этим ref нет вовсе.
   */
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((p) => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor.kind, narrow]);

  // Переход включается РОВНО кадром позже первой постановки — потому и
  // `requestAnimationFrame`, а не голый вызов в теле эффекта. Включи его в
  // том же кадре, и первым движением панели стал бы её заезд из левого
  // верхнего угла: до замера её место ещё не посчитано.
  useEffect(() => {
    if (size.w === 0 || view.w === 0) return;
    const id = requestAnimationFrame(() => setMoves(true));
    return () => cancelAnimationFrame(id);
  }, [size.w, view.w]);

  // Якоря нет и уже не будет — шаг перешагивается молча. Из эффекта, а не
  // прямо в теле: смена состояния во время рендера — ошибка React, а событие
  // здесь приходит из наблюдателя, не из клика.
  useEffect(() => {
    if (anchor.kind === 'missing') skipStep();
  }, [anchor.kind, skipStep]);

  // Узел ещё ждут (его нет в документе — скелетон, ответ сервера) — экран не
  // затемняем: мигать чёрным ради шага, который может и не состояться, хуже,
  // чем показать его чуть позже. Между шагами сюда уже не попадают — там узел
  // измеряется сразу, см. комментарий выше.
  if (!active || !step) return null;
  if (anchor.kind === 'waiting' || anchor.kind === 'missing') return null;

  const { tour, position, total, first, last } = active;
  const rect = anchor.kind === 'found' ? anchor.rect : null;

  // Лого — только на самой первой карточке тура: без якоря, это обложка
  // раздела, а не подсказка про конкретный элемент, и рядом с заголовком
  // уместна марка продукта. На остальных шагах она бы просто повторялась.
  const cover = !!step.cover;
  const card = (
    <TourCard
      // Карточка — единственное, что ремонтируется на каждый шаг: её эффект
      // ставит фокус на кнопку продвижения, и он обязан отработать заново.
      key={`${tour.id}:${active.step}`}
      tourId={tour.id}
      stepKey={step.key}
      title={t(`${tour.id}.${step.key}Title`)}
      body={t(`${tour.id}.${step.key}Body`)}
      position={t('position', { current: position, total })}
      first={first}
      last={last}
      logo={first && !step.anchor}
      cover={cover}
      onPrev={prev}
      onNext={next}
      onDismiss={dismiss}
    />
  );

  /*
   * Узкий экран — лист снизу, без переезда: на 360 пикселях панели некуда
   * ехать, а попап накрыл бы ровно то, что подсвечивает. Обложка сюда не
   * попадает — ей отведён центр на любой ширине (см. TourStep.cover).
   */
  if (narrow && !cover) {
    return (
      <>
        <Scrim rect={rect} />
        <div
          className="tour-card tour-sheet"
          role="dialog"
          aria-label={t(`${tour.id}.${step.key}Title`)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') dismiss();
          }}
        >
          {card}
        </div>
      </>
    );
  }

  const pos = place(rect, size, view);

  return (
    <>
      <Scrim rect={rect} />
      {/* Одна панель на весь тур: она переезжает от элемента к элементу, а
          меняется в ней только содержимое. Пока карточка была попапом со
          своим `key`, каждый шаг создавал её заново — она возникала на новом
          месте, минуя дорогу туда. */}
      <div
        ref={panel}
        className={`tour-card tour-panel${moves ? ' is-placed' : ''}${cover ? ' tour-cover' : ''}`}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        role="dialog"
        aria-label={t(`${tour.id}.${step.key}Title`)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') dismiss();
        }}
      >
        {card}
      </div>
    </>
  );
}

/**
 * Затемнение с прямоугольной дыркой.
 *
 * Дырка — маска, а не четыре прямоугольника вокруг цели: четыре стыкуются по
 * субпиксельным координатам и дают волосяные щели на дробном devicePixelRatio.
 * Маска же — одна фигура, и её край всегда один.
 *
 * Рамка поверх нужна светлой теме: там затемнение снаружи слабее, и без волоса
 * граница выделенного просто не читается.
 */
function Scrim({ rect }: { rect: AnchorRect | null }) {
  return (
    <div className="tour-scrim" aria-hidden>
      <svg width="100%" height="100%">
        <defs>
          <mask id="tour-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            {rect && (
              <rect
                className="tour-hole"
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                fill="#000"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="var(--scrim)" mask="url(#tour-hole)" />
        {rect && (
          <rect
            className="tour-hole"
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="none"
            stroke="var(--major)"
            strokeWidth="1"
          />
        )}
      </svg>
    </div>
  );
}

/**
 * Содержимое карточки — одно на оба способа показа (попап и лист снизу).
 *
 * Порядок кнопок тот же, что в диалогах продукта: уход слева, продвижение
 * справа, потому что справа заканчивается чтение.
 *
 * Кнопка ухода подписана «Не показывать», а не «Пропустить», и это не
 * косметика: она гасит обучение на всех страницах разом (`dismiss`).
 * «Пропустить» обещало пропуск одного раздела — ровно то, чего она НЕ делает.
 */
function TourCard({
  tourId,
  stepKey,
  title,
  body,
  position,
  first,
  last,
  logo,
  cover,
  onPrev,
  onNext,
  onDismiss,
}: {
  /** Вместе со `stepKey` — адрес текстов шага в каталоге переводов. */
  tourId: string;
  stepKey: string;
  title: string;
  body: string;
  position: string;
  first: boolean;
  last: boolean;
  logo: boolean;
  /** Обложка продукта: под лидом три пункта и сноска (см. TourStep.cover). */
  cover: boolean;
  onPrev: () => void;
  onNext: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('onboarding');
  const forward = useRef<HTMLButtonElement>(null);

  /*
   * Фокус — на кнопку продвижения, один раз за шаг.
   *
   * Пустые зависимости здесь достаточны, потому что вся карточка монтируется
   * заново на каждый шаг (`key` в TourOverlay). Проп `autoFocus` не годится:
   * внутри Popover фокусом при появлении распоряжается Radix, и чей вызов
   * окажется последним, зависит от порядка эффектов — то есть от версии
   * библиотеки. Явный вызов из своего эффекта такой зависимости не имеет.
   *
   * `preventScroll`: подсвеченный элемент только что подвели к центру экрана
   * прокруткой, и фокус на кнопке фиксированной карточки не должен уводить
   * страницу обратно.
   */
  useEffect(() => {
    forward.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <div className={`tc-h${logo ? ' tc-h-logo' : ''}`}>
        <div className="tc-ht">
          <span className="tc-n">{position}</span>
          <h3>{title}</h3>
        </div>
        {logo && (
          <div className="tc-h-r">
            {/* Язык переключается прямо с обложки: это первый экран продукта,
                и человеку, открывшему его не на своём языке, незачем искать
                шапку под затемнением. Только здесь — на подсказках к
                элементам тумблер спорил бы с тем, что они объясняют. */}
            {cover && <LocaleSwitch className="seg-tight" />}
            <VirexLogo className="tc-logo" aria-hidden />
          </div>
        )}
      </div>
      {/* aria-live: шаг меняется без перезагрузки и без смены фокуса на новый
          текст — скринридер иначе промолчит. */}
      <p className="tc-b" aria-live="polite">
        {body}
      </p>
      {/* Путь к своей системе: найти, что работает, — проверить это на своих
          данных — сделать результат стабильным. Каждый шаг подкреплён тем,
          что реально есть на экранах. Пунктов ровно три, и это рамка
          продукта, а не список фич: см. TourStep.cover.
          `<ol>`, а не набор блоков: шаги идут в определённом порядке, и он
          часть смысла. Нумерация из этого и растёт — счётчиком CSS по списку,
          без цифр в разметке. */}
      {cover && (
        <ol className="tc-pts">
          {[1, 2, 3].map((n) => (
            <li className="tc-pt" key={n}>
              <h4>{t(`${tourId}.${stepKey}P${n}Title`)}</h4>
              <p>{t(`${tourId}.${stepKey}P${n}Body`)}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="tc-f">
        <Button variant="bare" onClick={onDismiss}>
          {t('skip')}
        </Button>
        <span className="tc-sp" />
        {!first && (
          <Button variant="default" onClick={onPrev}>
            {t('back')}
          </Button>
        )}
        <Button variant="solid" ref={forward} onClick={onNext}>
          {last ? t('done') : t('forward')}
        </Button>
      </div>
    </>
  );
}
