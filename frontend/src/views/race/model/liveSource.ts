import {
  buildCourse,
  COUNTDOWN,
  interpCars,
  predictCar,
  progressOf,
  ranking,
  type Cause,
  type Course,
  type InputLog,
  type LiveStore,
  type SimEvent,
  type Strike,
} from '@/entities/race';
import type { CarView, Frame, FrameSource } from '@/widgets/race-scene';

export type FeedText =
  | { k: 'hit'; cause: Cause; dmg: number }
  | { k: 'out'; cause: Cause }
  | { k: 'finish'; first: boolean }
  | { k: 'slide' };

export interface LiveHud {
  /** Время гонки по часам сервера. */
  t: number;
  /** 1–3 — красные огни, 4 — зелёный, 0 — огней нет. */
  lights: number;
  place: number;
  speed: number;
  hp: number;
  me: number | null;
  meDead: boolean;
  cam: number;
  progress: number[];
  dead: boolean[];
  feed: { id: number; slot: number; text: FeedText }[];
}

export interface LiveSource extends FrameSource {
  hud: LiveHud | null;
}

/**
 * Кадр идущей гонки. Две шкалы времени: опасности и своя машина — на «сейчас»
 * по часам сервера (своя — предсказанием от последнего снимка, расхождение
 * гаснет за 0,1 с); чужие машины и события снимков — на «сейчас − задержка
 * суда − 0,1 с», где для них уже есть два снимка. Взрыв, показанный
 * предсказанием, сцена по снимку не повторяет — она сверяет причину (`src`).
 */
export function createLiveSource(store: LiveStore, log: InputLog, anon: string): LiveSource {
  let course: Course | null = null;
  let seed = -1;
  let raceId = '';
  let lastSnapT = -1;
  let err = { x: 0, z: 0 };
  let shown: { x: number; z: number } | null = null;
  const strikes = new Map<number, Strike>();
  let feed: (LiveHud['feed'][number] & { at: number })[] = [];
  let feedSeq = 0;

  const src: LiveSource = {
    hud: null,
    next(dt): Frame | null {
      const v = store.view;
      const r = v?.race;
      const dyn = r?.dyn;
      if (!v || !r || !dyn || r.startAt == null) return null;
      if (r.id !== raceId) {
        raceId = r.id;
        if (r.seed !== seed) {
          seed = r.seed;
          course = buildCourse(r.seed);
        }
        strikes.clear();
        feed = [];
        lastSnapT = -1;
        err = { x: 0, z: 0 };
        shown = null;
      }
      const c = course!;
      const now = store.clock();
      const tOthers = now - v.config.delayMs / 1000 - 0.1;
      const me = r.me;
      const nameOf = (slot: number) => r.racers.find((x) => x.slot === slot)?.name ?? anon;

      const others = interpCars(store.snaps, tOthers) ?? dyn.cars;
      const cars: CarView[] = others.map((o) => ({ ...o, tag: o.slot === me ? null : nameOf(o.slot), brake: false }));
      let gone = dyn.gone;
      const shownEvents: SimEvent[] = [];

      if (me !== null && !dyn.cars[me].dead) {
        const pev: SimEvent[] = [];
        const pred = predictCar(c, dyn, me, log, now, pev);
        if (dyn.t !== lastSnapT) {
          if (shown) {
            err = { x: shown.x - pred.car.x, z: shown.z - pred.car.z };
            if (Math.abs(err.x) > 0.6 || Math.abs(err.z) > 1500) err = { x: 0, z: 0 };
          }
          lastSnapT = dyn.t;
        }
        const k = Math.exp(-dt / 0.1);
        err = { x: err.x * k, z: err.z * k };
        const own = { ...pred.car, x: pred.car.x + err.x, z: pred.car.z + err.z };
        shown = { x: own.x, z: own.z };
        cars[me] = { ...own, tag: null, brake: log.at(now).brake };
        gone = dyn.gone.map((g, i) => g || pred.gone[i]);
        for (const e of pev) if (e.k === 'boom') shownEvents.push(e);
      } else shown = null;

      for (const e of store.take(tOthers)) {
        shownEvents.push(e);
        let text: FeedText | null = null;
        if (e.k === 'hit' && e.dmg > 0) text = { k: 'hit', cause: e.cause, dmg: e.dmg };
        else if (e.k === 'out') text = { k: 'out', cause: e.cause };
        else if (e.k === 'finish') text = { k: 'finish', first: e.first };
        else if (e.k === 'slide' && e.slot === me) text = { k: 'slide' };
        if (text && 'slot' in e) feed.push({ id: ++feedSeq, slot: e.slot, text, at: now });
      }
      feed = feed.filter((x) => now - x.at < 5).slice(-4);

      for (const st of dyn.strikes) strikes.set(st.id, st);
      for (const [id, st] of strikes) if (st.at < now - 0.5) strikes.delete(id);

      let cam = me ?? 0;
      const mine = me !== null ? dyn.cars[me] : null;
      if (!mine || (mine.dead && tOthers - mine.deadAt > 1.8)) {
        const lead = cars.filter((x) => !x.dead).sort((a, b) => b.z - a.z)[0];
        if (lead) cam = lead.slot;
      }

      const order = ranking(cars);
      src.hud = {
        t: now,
        lights: now < 0.7 ? 1 : now < 1.4 ? 2 : now < COUNTDOWN ? 3 : now < COUNTDOWN + 0.9 ? 4 : 0,
        place: me !== null ? order.findIndex((x) => x.slot === me) + 1 : 0,
        speed: me !== null ? cars[me].speed : 0,
        hp: mine?.hp ?? 0,
        me,
        meDead: !!mine?.dead,
        cam,
        progress: cars.map(progressOf),
        dead: cars.map((x) => x.dead),
        feed: feed.map(({ id, slot, text }) => ({ id, slot, text })),
      };
      log.prune(dyn.t - 0.5);

      return {
        course: c,
        t: now,
        cars,
        cam,
        gone,
        towers: dyn.towers,
        strikes: [...strikes.values()],
        events: shownEvents,
      };
    },
  };
  return src;
}
