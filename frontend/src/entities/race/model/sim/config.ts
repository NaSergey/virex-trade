/**
 * Геометрия, темп и машины гонки (спека `2026-10-18-race-game-design.md`).
 *
 * Каталог `sim/` — в двух копиях: `backend/src/race/sim` и
 * `frontend/src/entities/race/model/sim`. Сервер считает гонку, браузер той же
 * физикой ведёт свою машину, пока едет снимок; сборки раздельные, общего пакета
 * нет. Копии сверяет `race-sim-copy.spec.ts` — правка здесь означает правку там.
 */

/** Длина отрезка трассы, мировых единиц. */
export const SEG = 200;
/** Полуширина дороги. Поперечная координата машины — в долях полуширины. */
export const HALF = 1200;
export const START_SEG = 20;
/** Отрезок финиша. */
export const FIN = 1500;
/** За финишем — выбег, чтобы финишировавшим было где остановиться. */
export const NSEG = FIN + 220;
export const START_Z = START_SEG * SEG + 300;
export const TRACK_LEN = FIN * SEG;
/** Полуширина корпуса — машины расталкиваются по ней. */
export const CAR_HALF = 0.16;
/** Полуширина для ударов — уже корпуса: касание краем не считается аварией. */
export const HIT = 0.12;
/** Основание опоры ЛЭП — за обочиной. */
export const TOWER_X = 1.42;
/** Высота опоры: упав, она ложится поперёк двух полос из трёх. */
export const PH = 2100;
export const TOWER_LEN = PH / HALF;
export const LAMP_X = 1.2;
/** Снос в повороте: доля кривизны отрезка, умноженная на квадрат доли скорости. */
export const CENTRI = 0.14;
/** Скорость, принятая за «полную»: от неё снос и спидометр. */
export const VMAX = 6200;
export const LANES = [-2 / 3, 0, 2 / 3];
/** Шаг симуляции, с. */
export const STEP = 1 / 60;
/** Красные огни до старта, с. */
export const COUNTDOWN = 2.2;
/** Опора качается в красной зоне, потом падает. */
export const WARN_S = 0.7;
export const FALL_S = 0.55;
/** Прицел удара с неба до взрыва. */
export const STRIKE_S = 1.6;
/**
 * Опасность объявляется на столько раньше своего начала: решение сервера
 * доезжает до браузера с задержкой суда и сети, и без запаса браузер узнавал бы
 * о красной зоне на четверть секунды позже её начала.
 */
export const ANNOUNCE = 0.3;
/** После первого финиша остальные доезжают ещё столько, потом гонка кончена. */
export const AFTER_FIRST = 9;
/**
 * Потолок гонки от зелёного огня: обычно она идёт около минуты, и если все
 * живы, но никто не доехал (стоят на тормозе), банк не должен висеть вечно —
 * побеждает проехавший дальше всех.
 */
export const MAX_RACE_S = 150;

export type CarId = 'arrow' | 'buggy' | 'tank';
export const CAR_IDS: readonly CarId[] = ['arrow', 'buggy', 'tank'];

/**
 * steer — сколько полудорог в секунду машина проходит вбок (полоса — 0,67);
 * knock — доля скорости, что остаётся после удара; stun — секунды без руля.
 * Подобрано прогоном гонок ботов (спека, раздел «Машины»).
 */
export interface CarDef {
  max: number;
  acc: number;
  steer: number;
  hp: number;
  knock: number;
  stun: number;
}

export const CARS: Record<CarId, CarDef> = {
  arrow: { max: 6150, acc: 2500, steer: 1.85, hp: 2, knock: 0.5, stun: 0.8 },
  buggy: { max: 5600, acc: 2800, steer: 2.4, hp: 3, knock: 0.55, stun: 0.75 },
  tank: { max: 5650, acc: 2200, steer: 1.6, hp: 4, knock: 0.82, stun: 0.4 },
};
