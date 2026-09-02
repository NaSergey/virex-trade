'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Сколько ждать появления якоря, прежде чем пропустить шаг. Обзор и Аналитика
 * приезжают асинхронно, под скелетонами: полсекунды мало, десять — это уже
 * зависший тур, в котором человек смотрит на затемнение и не понимает, чего
 * ждёт.
 */
const WAIT_MS = 3000;

/** Воздух вокруг подсвеченного элемента, чтобы дырка не резала его по краю. */
export const HOLE_PAD = 6;

export type AnchorState =
  /** Якоря у шага нет вовсе — карточка по центру. */
  | { kind: 'center' }
  /** Ждём появления узла в документе. */
  | { kind: 'waiting' }
  /** Не дождались — шаг надо пропустить. */
  | { kind: 'missing' }
  | { kind: 'found'; rect: AnchorRect };

function measure(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  return {
    x: r.left - HOLE_PAD,
    y: r.top - HOLE_PAD,
    width: r.width + HOLE_PAD * 2,
    height: r.height + HOLE_PAD * 2,
  };
}

/**
 * Где сейчас на экране элемент этого шага.
 *
 * Три вещи, ради которых это отдельный хук:
 *
 * 1. **Ожидание.** Узла может ещё не быть — вместо него скелетон. Ждём через
 *    `MutationObserver`, а не поллингом: наблюдатель просыпается ровно тогда,
 *    когда дерево поменялось, и молчит всё остальное время.
 *
 * 2. **Пропуск.** Не дождались за `WAIT_MS` — состояние `missing`, и тур
 *    перешагивает шаг. Это штатный путь, а не ошибка: у пустого аккаунта нет
 *    ни кривой, ни открытых позиций, а переключателя бирж нет, когда биржа
 *    одна. Тур не обязан знать, чего именно сейчас нет на странице.
 *
 * 3. **Слежение.** Координаты снимаются в системе вьюпорта (`fixed`), поэтому
 *    любая прокрутка их меняет. Пересчёт — на `scroll`, `resize` и через
 *    `ResizeObserver` на самом узле, всё сведено в один кадр `rAF`: без этого
 *    дырка отстаёт от элемента при плавной прокрутке.
 */
export function useAnchorRect(selector: string | undefined): AnchorState {
  /*
   * Узел, который УЖЕ в документе, измеряется сразу, без промежуточного
   * «ищу».
   *
   * Это не оптимизация, а лечение мигания. Состояние `waiting` не рисует
   * ничего — ни затемнения, ни карточки. Пока шаг всегда начинал с него,
   * каждое нажатие «Далее» гасило затемнение на кадр и зажигало заново, с
   * проявлением: экран мигал на каждом шаге тура. А между шагами якорь почти
   * всегда уже в документе — страница отрисована ещё на первом.
   *
   * `waiting` остаётся для того, ради чего заводилось: узла в документе нет,
   * и его ждут (скелетон, ответ сервера). На сервере `document` недоступен,
   * поэтому проверка через `typeof`: тур там всё равно не рендерится (отметки
   * лежат в localStorage), но хук не должен падать от одного лишь импорта в
   * серверном окружении.
   */
  const initial = (): AnchorState => {
    if (!selector) return { kind: 'center' };
    if (typeof document === 'undefined') return { kind: 'waiting' };
    const el = document.querySelector(selector);
    return el ? { kind: 'found', rect: measure(el) } : { kind: 'waiting' };
  };
  const [state, setState] = useState<AnchorState>(initial);
  // Кадр держится в ref, а не в состоянии: его отмена — уборка, а не рендер.
  const frame = useRef<number | null>(null);

  /*
   * Смена селектора сбрасывает состояние прямо в рендере, а не в эффекте.
   *
   * Это тот самый штатный приём React «поправить состояние, когда изменился
   * проп»: сброс из эффекта дал бы лишний кадр, в котором на экране ещё стоит
   * прямоугольник ПРЕЖНЕГО элемента, — дырка на мгновение подсвечивала бы не
   * то. React выбрасывает такой рендер до отрисовки, поэтому кадр один.
   *
   * Это основной путь смены шага, а не запасной: панель тура живёт всё
   * обучение и не ремонтируется (иначе она телепортировалась бы вместо
   * переезда), поэтому селектор меняется прямо под работающим хуком.
   */
  const [prevSelector, setPrevSelector] = useState(selector);
  if (selector !== prevSelector) {
    setPrevSelector(selector);
    setState(initial);
  }

  useEffect(() => {
    if (!selector) return;

    let cancelled = false;
    let el: Element | null = null;
    let observer: MutationObserver | null = null;
    let timer: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    /*
     * События сводятся в один кадр — но кадр НЕ отменяется и не переназначается.
     *
     * Отмена выглядела правильным троттлингом и была ошибкой: элемент
     * подводится к центру плавной прокруткой, во время которой события scroll
     * идут каждый кадр. Каждое отменяло назначенный кадр и назначало
     * следующий, и обработчик не выполнялся ни разу за всю анимацию — шаг
     * оставался в состоянии «ищу якорь», карточка не появлялась, а тур со
     * стороны выглядел оборвавшимся. Здесь первое событие назначает кадр,
     * остальные до его выполнения ничего не делают.
     */
    const sync = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (cancelled || !el) return;
        // Узел мог уехать из документа между кадрами — например, страница
        // сменила состояние загрузки. Держать его прежний прямоугольник
        // значило бы подсвечивать пустое место.
        if (!el.isConnected) {
          setState({ kind: 'missing' });
          return;
        }
        setState({ kind: 'found', rect: measure(el) });
      });
    };

    const attach = (found: Element) => {
      el = found;
      observer?.disconnect();
      observer = null;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;

      // Подводим элемент к центру экрана: подсвечивать то, что осталось за
      // краем вьюпорта, — это затемнение без единой видимой дырки.
      found.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });

      resizeObserver = new ResizeObserver(sync);
      resizeObserver.observe(found);
      window.addEventListener('scroll', sync, { passive: true, capture: true });
      window.addEventListener('resize', sync);
      sync();
    };

    const existing = document.querySelector(selector);
    if (existing) {
      attach(existing);
    } else {
      observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) attach(found);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timer = window.setTimeout(() => {
        if (!cancelled && !el) setState({ kind: 'missing' });
      }, WAIT_MS);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      resizeObserver?.disconnect();
      if (timer !== null) window.clearTimeout(timer);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      window.removeEventListener('scroll', sync, { capture: true });
      window.removeEventListener('resize', sync);
    };
  }, [selector]);

  return state;
}

/**
 * Размеры вьюпорта.
 *
 * Нужны, чтобы посчитать, куда встанет панель: под якорем или над ним, и не
 * упрётся ли она в край. Через состояние, а не чтением `window` прямо в
 * разметке: чтение в рендере разошлось бы с серверным (там `window` нет) и
 * не пересчиталось бы при смене размера окна.
 *
 * `useLayoutEffect` вместо `useEffect`: первый замер обязан случиться до
 * отрисовки, иначе панель успевает мигнуть в неправильном месте.
 */
export function useViewport(): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const apply = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  return size;
}

/**
 * Узкий ли сейчас экран.
 *
 * Граница — те же 720px, на которых стоит мобильный блок globals.css: два
 * числа для одной и той же границы однажды разошлись бы, и карточка получила
 * бы стили листа, оставшись попапом. Нужна, потому что на телефоне карточка не
 * летает у элемента, а прилипает листом к низу: рядом с целью на 360px ширины
 * места просто нет, и попап накрывал бы ровно то, что подсвечивает.
 */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return narrow;
}
