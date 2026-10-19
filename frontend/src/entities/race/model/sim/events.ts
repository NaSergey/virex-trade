/**
 * События шага. Шаг не рисует и не шумит — сервер шлёт события в снимке, браузер
 * делает из них вспышки, пыль и ленту. `src` у взрыва — имя его причины
 * (`m<номер мины>`, `s<id удара>`, `c<место машины>`): браузер, сам показавший
 * взрыв по своему предсказанию, по нему не повторяет взрыв из снимка.
 */
export type Cause = 'mine' | 'pylon' | 'strike' | 'wreck';

export type SimEvent =
  | { k: 'boom'; t: number; z: number; x: number; big: boolean; src: string }
  | { k: 'hit'; t: number; slot: number; dmg: number; cause: Cause }
  | { k: 'out'; t: number; slot: number; cause: Cause }
  | { k: 'slide'; t: number; slot: number }
  | { k: 'land'; t: number; pylon: number }
  | { k: 'finish'; t: number; slot: number; first: boolean };
