import type { WeatherId } from '../model/types';

/** Погода дня — одна на все забеги дня, выбирается по дате (`model/meta.ts`, `weatherOf`). */
export const WEATHER: Record<WeatherId, { name: string; text: string }> = {
  clear: { name: 'Ясно', text: 'без изменений' },
  rain: { name: 'Ливень', text: 'все противники слабы к «Услышать»' },
  smog: { name: 'Смог', text: 'противники бьют на ход чаще, шиллингов +50 %' },
  fog: { name: 'Туман', text: 'крит у «Вспомнить» и «Сказать» — двойной' },
  wind: { name: 'Ветер', text: 'серия растёт вдвое быстрее, ошибка стоит ещё 2 здоровья' },
  holiday: { name: 'Праздник', text: 'лавки на 50 % дешевле, сцен на карте вдвое больше' },
  rush: { name: 'Час пик', text: 'боёв больше, скамеек меньше, очки ×1,3' },
};

export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];
