'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Одноразовая анимация сцены под курсором, которая доигрывает до конца.
 *
 * Анимация на `.gcard:hover` живёт, только пока совпадает селектор: курсор
 * ушёл посреди переворота — и карта рывком вернулась в начало. Поэтому
 * наведение (или фокус с клавиатуры) только ставит на сцену атрибут
 * `data-play`, а снимает его конец последней анимации жеста (`lastAnimation`
 * — имя её @keyframes), а не уход курсора. CSS запускает жест по
 * `[data-play]`.
 *
 * Повторное наведение, пока жест идёт, ничего не делает: атрибут уже стоит, и
 * селектор не перестаёт совпадать — анимация не перезапускается. Следующее
 * наведение после конца проиграет жест заново.
 *
 * Переходы (карты встают, свечи поднимаются) сюда не относятся: переход,
 * прерванный уходом курсора, плавно едет назад сам, и рывка там нет.
 */
export function usePlayOnHover(ref: RefObject<Element | null>, lastAnimation: string) {
  useEffect(() => {
    const scene = ref.current;
    const card = scene?.closest('.gcard');
    if (!scene || !card) return;

    const play = () => scene.setAttribute('data-play', '');
    const onFocus = () => {
      if (card.matches(':focus-visible')) play();
    };
    // animationcancel — на случай, если жест снят не концом (сцена скрыта,
    // анимация отменена): иначе атрибут остался бы навсегда, и следующее
    // наведение ничего бы не запустило.
    const onEnd = (e: Event) => {
      if ((e as AnimationEvent).animationName === lastAnimation) scene.removeAttribute('data-play');
    };

    card.addEventListener('pointerenter', play);
    card.addEventListener('focus', onFocus);
    scene.addEventListener('animationend', onEnd);
    scene.addEventListener('animationcancel', onEnd);
    return () => {
      card.removeEventListener('pointerenter', play);
      card.removeEventListener('focus', onFocus);
      scene.removeEventListener('animationend', onEnd);
      scene.removeEventListener('animationcancel', onEnd);
    };
  }, [ref, lastAnimation]);
}
