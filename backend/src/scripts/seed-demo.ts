/**
 * Демо-аккаунт: витрина продукта для того, кто ещё не завёл свой.
 *
 * Запуск локально:
 *   npx ts-node -r tsconfig-paths/register src/scripts/seed-demo.ts
 * На проде (скрипт компилируется вместе с остальным кодом в dist/):
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec api node dist/scripts/seed-demo.js
 *
 * Прогон **пересоздаёт** пользователя целиком: сначала удаление по почте (всё
 * остальное уезжает каскадом), потом раскладка заново. Иначе датасет нельзя
 * было бы чинить — второй прогон дописывал бы сделки к остаткам первого, и
 * витрина расходилась бы с тем, что видно локально.
 *
 * Генератор детерминированный (`mulberry32` с зашитым seed): прогон на сервере
 * обязан дать ровно то, что уже посмотрели глазами локально. Единственное, что
 * привязано к моменту запуска, — конец периода: демо показывает последние
 * полгода, а не полгода вокруг даты, когда скрипт написали. Иначе фильтр «30
 * дней» на витрине оказался бы пустым.
 *
 * Почему данные не «просто красивые». Продукт диагностический: он показывает,
 * на чём человек ошибается. Ровный прибыльный счёт — худшая для него витрина,
 * потому что все разделы честно ответят «всё в порядке» и смотреть будет не на
 * что. Поэтому в историю намеренно зашиты три ошибки, которые продукт берётся
 * ловить: убыточные держатся втрое дольше прибыльных, после крупного минуса
 * идёт серия отыгрыша, а входы без разметки торгуются хуже размеченных.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CTX_VERSION } from '../trades/trade-context.service';
import { RISK_VERSION } from '../balance/trade-risk.service';

/**
 * Учётка публична по назначению: её вводит кнопка «Посмотреть демо» на входе
 * (`frontend/src/app/login/page.tsx`), и пароль в коде фронтенда — не утечка, а
 * условие работы кнопки. Домен `example.com` зарезервирован RFC 2606 и не может
 * оказаться чужим почтовым адресом.
 */
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo1234';
const DEMO_NAME = 'Демо';

const EXCHANGE = 'bybit';
const DAYS = 180;
const POSITIONS = 170;
/**
 * Сколько входов в отыгрыше должно оказаться в книге.
 *
 * Число, а не вероятность срабатывания: вероятность каждый раз даёт другой
 * результат — правка любого другого параметра сдвигает весь поток ГПСЧ, и
 * отыгрышей выходило то шесть, то сорок. А их количество определяет и то,
 * покажет ли «Цена привычек» хоть что-нибудь (её порог — 12 сделок в срезе),
 * и то, останется ли счёт в плюсе. Такое не отдают жребию.
 */
const TILT_TRADES = 13;
const START_BALANCE = 5000;
/** Комиссия тейкера Bybit, обе стороны. */
const TAKER_FEE = 0.00055;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ─────────────────────────────────────────────────────────────────────────────
// Детерминированный ГПСЧ
// ─────────────────────────────────────────────────────────────────────────────

/** mulberry32 — короткий, быстрый, полностью воспроизводимый по seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20260904);

const rand = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;

/** Логнормальное — для времён удержания и множителей: длинный правый хвост. */
function logNormal(medianValue: number, sigma: number): number {
  // Бокс–Мюллер: два равномерных дают нормальное, экспонента — логнормальное.
  const u1 = Math.max(rnd(), 1e-9);
  const u2 = rnd();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return medianValue * Math.exp(sigma * z);
}

// ─────────────────────────────────────────────────────────────────────────────
// Инструменты
// ─────────────────────────────────────────────────────────────────────────────

/** Вес — как часто символ встречается: у всех разный масштаб цены и объёма. */
const SYMBOLS = [
  { symbol: 'BTCUSDT', price: 62000, vol: 0.022, weight: 26, step: 0.001 },
  { symbol: 'ETHUSDT', price: 2450, vol: 0.028, weight: 20, step: 0.01 },
  { symbol: 'SOLUSDT', price: 145, vol: 0.042, weight: 14, step: 0.1 },
  { symbol: 'LINKUSDT', price: 11.5, vol: 0.038, weight: 8, step: 0.1 },
  { symbol: 'AVAXUSDT', price: 24, vol: 0.04, weight: 7, step: 0.1 },
  { symbol: 'TONUSDT', price: 5.4, vol: 0.035, weight: 6, step: 1 },
  { symbol: 'NEARUSDT', price: 4.2, vol: 0.045, weight: 6, step: 1 },
  { symbol: 'XRPUSDT', price: 0.52, vol: 0.033, weight: 5, step: 1 },
  { symbol: 'DOGEUSDT', price: 0.11, vol: 0.05, weight: 4, step: 10 },
  { symbol: 'ARBUSDT', price: 0.68, vol: 0.048, weight: 4, step: 1 },
] as const;

type SymbolSpec = (typeof SYMBOLS)[number];

const SYMBOL_BAG: SymbolSpec[] = SYMBOLS.flatMap((s) => Array<SymbolSpec>(s.weight).fill(s));

/**
 * Дневной ряд цен на каждый символ — случайное блуждание с лёгким сносом.
 * Нужен затем, чтобы цена входа зависела от даты: без него все сделки по BTC
 * стояли бы вокруг одной цифры и график журнала выглядел бы синтетикой.
 */
function priceSeries(spec: SymbolSpec): number[] {
  const out: number[] = [];
  let p = spec.price * rand(0.62, 0.9); // полгода назад — заметно ниже
  const drift = Math.pow(1 / rand(0.62, 0.9), 1 / DAYS) - 1;
  for (let d = 0; d <= DAYS; d++) {
    p *= 1 + drift + (rnd() - 0.5) * spec.vol;
    out.push(p);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Теги и профили входа
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Девять дефолтных тегов новой учётки (`TagsService.DEFAULT_TAGS`) плюс два
 * своих: аккаунт, который полгода торговал, обязан выглядеть как аккаунт, где
 * теги заводили под себя, — иначе демо показывает не разметку, а заводскую
 * заготовку.
 */
const TAGS: Array<{ name: string; type: string; color: string }> = [
  { name: 'Пробой', type: 'setup', color: '#6366f1' },
  { name: 'Ретест', type: 'setup', color: '#22c55e' },
  { name: 'Отбой от уровня', type: 'setup', color: '#ef4444' },
  { name: 'По тренду', type: 'setup', color: '#f59e0b' },
  { name: 'Контртренд', type: 'setup', color: '#06b6d4' },
  { name: 'FOMO', type: 'emotion', color: '#ec4899' },
  { name: 'Тильт', type: 'emotion', color: '#a855f7' },
  { name: 'Вход без стопа', type: 'mistake', color: '#84cc16' },
  { name: 'Передержал', type: 'mistake', color: '#14b8a6' },
  { name: 'Объёмный уровень', type: 'setup', color: '#f97316' },
  { name: 'Дивергенция', type: 'setup', color: '#0ea5e9' },
];

/**
 * Профиль входа — то, ради чего вся разметка и существует: у разных причин
 * входа разная отдача, и раздел «PnL по тегам» должен это показать.
 *
 * `winRate` / `win` / `loss` — доля выигрышей и средние множители к риску R.
 * Ожидание считается как winRate*win − (1−winRate)*loss и специально держится
 * скромным: система с +0.7R на сделку в жизни не встречается, а витрина,
 * которая такое обещает, врёт про продукт ещё до регистрации.
 */
interface Profile {
  id: string;
  weight: number;
  /** Теги, которые человек ставит этому входу всегда. */
  tags: string[];
  /**
   * Теги, которые он ставит не каждый раз, с вероятностью.
   *
   * Без этого пара тегов профиля стояла бы ровно на одних и тех же сделках, и
   * «PnL по тегам» показывал бы две строки с совпадающими до цента числами —
   * в живом журнале так не бывает, и синтетику видно сразу. Заодно только так
   * появляется разница между «связкой» и одиночным тегом, ради которой раздел
   * комбинаций и существует.
   */
  sometimes?: Array<[string, number]>;
  winRate: number;
  win: number;
  loss: number;
}

const PROFILES: Profile[] = [
  // Рабочее ядро: то, на чём этот счёт держится.
  { id: 'trend-retest', weight: 32, tags: ['По тренду'], sometimes: [['Ретест', 0.7]], winRate: 0.57, win: 1.9, loss: 1.0 },
  { id: 'breakout', weight: 17, tags: ['Пробой'], winRate: 0.45, win: 2.1, loss: 1.0 },
  { id: 'level', weight: 12, tags: ['Отбой от уровня'], sometimes: [['Объёмный уровень', 0.55]], winRate: 0.56, win: 1.5, loss: 1.0 },
  { id: 'divergence', weight: 7, tags: ['Дивергенция'], winRate: 0.48, win: 1.35, loss: 1.05 },
  // Что стоит денег.
  { id: 'counter', weight: 11, tags: ['Контртренд'], winRate: 0.36, win: 1.3, loss: 1.15 },
  { id: 'fomo', weight: 6, tags: ['FOMO'], sometimes: [['Пробой', 0.6]], winRate: 0.28, win: 1.1, loss: 1.4 },
  // Вход не по системе — та самая ошибка, которую продукт берётся ловить.
  // Тегов нет вовсе: человек не смог назвать причину, потому что её не было.
  { id: 'untagged', weight: 15, tags: [], winRate: 0.4, win: 1.2, loss: 1.25 },
];

/**
 * Состав входов раскладывается точной квотой и перемешивается, а не тянется
 * жребием на каждую сделку. По той же причине, что и исход: при жребии на
 * профиль с весом 6 выпадало то четыре входа, то одиннадцать, и редкая
 * причина входа оказывалась на витрине то отчётливо убыточной, то никакой.
 * Веса — доли от POSITIONS, а не проценты: сумма их и есть размер книги.
 */
function profileDeck(count: number): Profile[] {
  const total = PROFILES.reduce((s, p) => s + p.weight, 0);
  const deck: Profile[] = [];
  for (const p of PROFILES) {
    const n = Math.round((count * p.weight) / total);
    for (let i = 0; i < n; i++) deck.push(p);
  }
  // Fisher–Yates на том же ГПСЧ: порядок обязан быть воспроизводимым, иначе
  // прогон на сервере разложит те же сделки по другим датам.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Исход сделки разыгрывается квотой, а не независимым броском монеты.
 *
 * Профилей восемь, на редкий приходится 8–12 сделок, и на такой выборке
 * биномиальный разброс спокойно переворачивает знак: в первом прогоне
 * «Контртренд» вышел самым прибыльным тегом счёта. Витрина, где убыточная
 * причина входа выглядит лучшей, рассказывает про продукт ровно обратное
 * задуманному, а «это случайность выборки» посетитель прочитать не может.
 *
 * Диффузия ошибки (`acc += winRate`, выигрыш при переполнении) даёт ровно
 * round(n · winRate) выигрышей на профиль. Джиттер — чтобы выигрыши и
 * проигрыши не легли видимым правильным чередованием: серии в демо должны
 * быть, иначе разделы про просадку и отыгрыш не на чем показать.
 */
const winQuota = new Map<string, number>();
function drawWin(profile: Profile): boolean {
  const acc = (winQuota.get(profile.id) ?? rnd()) + profile.winRate + (rnd() - 0.5) * 0.3;
  const win = acc >= 1;
  winQuota.set(profile.id, win ? acc - 1 : acc);
  return win;
}

/** Отыгрыш после крупного минуса: отдельный профиль, в общий мешок не входит. */
const TILT_PROFILE: Profile = {
  id: 'tilt',
  weight: 0,
  tags: ['Тильт'],
  winRate: 0.26,
  win: 1.0,
  loss: 1.6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Генерация позиций
// ─────────────────────────────────────────────────────────────────────────────

interface Part {
  qty: number;
  exitPrice: number;
  pnl: number;
  closeFee: number;
  closedAt: number;
}

interface Position {
  symbol: string;
  direction: 'long' | 'short';
  profile: Profile;
  tags: string[];
  entryMs: number;
  closeMs: number;
  entryPrice: number;
  qty: number;
  leverage: number;
  stopLoss: number | null;
  openFee: number;
  pnl: number;
  parts: Part[];
  balanceAtEntry: number;
  riskUsd: number;
}

/**
 * Момент входа: рабочие часы, а не равномерный шум по суткам. Живой журнал
 * узнаётся именно по этому — по пустым ночам и провалу в выходные, — и раздел
 * «по часам и дням недели» без такой структуры показывает ровную серость.
 */
function entryMoment(dayIndex: number, startMs: number): number {
  const dow = new Date(startMs + dayIndex * DAY).getUTCDay();
  // Лондон и Нью-Йорк — основная масса, азиатская сессия реже, ночь почти пуста.
  const hour = chance(0.55) ? randInt(8, 16) : chance(0.6) ? randInt(3, 7) : randInt(17, 23);
  const weekendShift = dow === 0 || dow === 6 ? randInt(0, 2) : 0;
  return (
    startMs + (dayIndex + weekendShift) * DAY + hour * HOUR + randInt(0, 59) * 60_000 + randInt(0, 59) * 1000
  );
}

function buildPositions(now: number): Position[] {
  const startMs = now - DAYS * DAY;
  const series = new Map<string, number[]>(SYMBOLS.map((s) => [s.symbol, priceSeries(s)]));

  // Дни входов: выходные реже — торгового человека в субботу за экраном меньше.
  const days: number[] = [];
  while (days.length < POSITIONS) {
    const d = randInt(0, DAYS - 1);
    const dow = new Date(startMs + d * DAY).getUTCDay();
    if ((dow === 0 || dow === 6) && chance(0.7)) continue;
    days.push(d);
  }
  days.sort((a, b) => a - b);

  const deck = profileDeck(days.length);
  const positions: Position[] = [];
  let balance = START_BALANCE;
  let tilt = 0;

  const open = (dayIndex: number, profile: Profile, sizeMult: number, entryMs: number): Position => {
    const spec = pick(SYMBOL_BAG);
    const prices = series.get(spec.symbol)!;
    const base = prices[Math.min(dayIndex, prices.length - 1)];
    const entryPrice = base * (1 + (rnd() - 0.5) * spec.vol * 0.6);
    const direction: 'long' | 'short' = chance(0.62) ? 'long' : 'short';

    // Размер считается от риска, а не от «сколько не жалко»: тогда exposurePct
    // и plannedRiskPct в TradeRisk получаются согласованными между собой.
    const riskPct = rand(0.6, 2.1) * sizeMult;
    const riskUsd = (balance * riskPct) / 100;
    // Стоп пошире — значит меньше плечо и меньше комиссия с оборота. Она тут
    // не косметика: 0.055% с каждой стороны от номинала — это ~0.05R со сделки,
    // и на двух сотнях позиций комиссии съедают весь край системы. Ровно то,
    // ради чего продукт показывает их отдельной строкой, а не прячет в итог.
    const stopDistPct = rand(1.4, 3.8);
    const notional = riskUsd / (stopDistPct / 100);
    const rawQty = notional / entryPrice;
    const qty = Math.max(spec.step, Math.round(rawQty / spec.step) * spec.step);

    // Часть входов — без стопа на бирже. Это отдельная ошибка со своим тегом, и
    // у таких сделок plannedRiskPct честно остаётся null.
    const noStop = chance(0.18);
    const stopLoss = noStop
      ? null
      : direction === 'long'
        ? entryPrice * (1 - stopDistPct / 100)
        : entryPrice * (1 + stopDistPct / 100);

    const win = drawWin(profile);
    // Разброс множителя узкий намеренно. При sigma 0.45 сумма по профилю из
    // двадцати сделок — уже шум: в прогоне подряд «Пробой» давал то +$750, то
    // +$11 при одном и том же винрейте. Витрина, где итог тега определяется
    // жребием, показывает, что разметка ни на что не влияет.
    const rMultiple = win
      ? logNormal(profile.win, 0.3)
      : -logNormal(profile.loss, noStop ? 0.42 : 0.2); // без стопа — хвост толще
    const pnl = riskUsd * rMultiple;

    // Убыточные держатся втрое дольше прибыльных — ошибка №3 из продуктовой
    // рамки. Это не случайный разброс: медианы разведены намеренно.
    const holdH = profile.id === 'tilt' ? logNormal(0.7, 0.6) : win ? logNormal(3.5, 0.8) : logNormal(11, 0.85);
    const closeMs = entryMs + Math.max(6 * 60_000, holdH * HOUR);

    const tags = [...profile.tags];
    for (const [name, p] of profile.sometimes ?? []) if (chance(p)) tags.push(name);
    if (noStop && profile.tags.length > 0) tags.push('Вход без стопа');
    // «Передержал» ставится по факту: минус, просиженный больше суток.
    if (!win && holdH > 24 && profile.tags.length > 0 && chance(0.75)) tags.push('Передержал');

    const openFee = qty * entryPrice * TAKER_FEE;

    // Частичный выход — только из прибыли: так и торгуют, и именно поэтому
    // склейка частей в одну позицию вообще понадобилась (см. positions.ts).
    const partCount = win && chance(0.3) ? randInt(2, 3) : 1;
    const parts: Part[] = [];
    let qtyLeft = qty;
    let pnlLeft = pnl;
    for (let i = 0; i < partCount; i++) {
      const last = i === partCount - 1;
      const share = last ? 1 : rand(0.35, 0.55);
      const partQty = last ? qtyLeft : Math.max(spec.step, Math.round((qtyLeft * share) / spec.step) * spec.step);
      const partPnl = last ? pnlLeft : pnl * (partQty / qty);
      const exitPrice =
        direction === 'long'
          ? entryPrice + partPnl / partQty
          : entryPrice - partPnl / partQty;
      parts.push({
        qty: partQty,
        exitPrice,
        pnl: partPnl,
        closeFee: partQty * exitPrice * TAKER_FEE,
        // Части выходят лесенкой внутри времени жизни позиции.
        closedAt: entryMs + ((closeMs - entryMs) * (i + 1)) / partCount,
      });
      qtyLeft -= partQty;
      pnlLeft -= partPnl;
    }

    const position: Position = {
      symbol: spec.symbol,
      direction,
      profile,
      tags,
      entryMs,
      closeMs,
      entryPrice,
      qty,
      leverage: pick([3, 5, 10, 10, 20]),
      stopLoss,
      openFee,
      pnl,
      parts,
      balanceAtEntry: balance,
      riskUsd,
    };
    balance += pnl - openFee - parts.reduce((s, p) => s + p.closeFee, 0);
    return position;
  };

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const position = open(d, deck[i % deck.length], 1, entryMoment(d, startMs));
    positions.push(position);

    // Отыгрыш: крупный минус тянет за собой серию входов в тот же день —
    // больше обычного размером, короче по времени и почти всегда в минус.
    // Ошибка №2 продуктовой рамки, и увидеть её можно только так — цепочкой,
    // а не одной отдельно стоящей плохой сделкой.
    // Порог в R, а не в долларах: он обязан срабатывать примерно на десятой
    // части минусов, а не на «когда-нибудь». При sigma 0.3 у множителя убытка
    // −1.25R — это верхние ~20% потерь; −2R не наступает почти никогда.
    //
    // Частота подобрана не «на глаз»: «Цена привычек» вообще не проверяет
    // гипотезу на срезе меньше MIN_SEGMENT = 12 сделок (habits.service.ts).
    // Три-четыре отыгрыша за полгода — правдоподобно, но флагманский блок
    // обзора на них промолчит, и демо покажет пустое место там, где у
    // продукта главный ответ. Полтора десятка входов в отыгрыше — уже срез,
    // и заодно он же наполняет «переторговку» и «разгон размера».
    // Квота, набираемая равномерно по календарю: к середине истории должна
    // быть набрана половина. Серии короткие по той же причине — редкий, но
    // длинный кластер собрал бы тот же десяток сделок в двух местах
    // календаря, и проверка «Цены привычек» на второй половине истории (Oos)
    // провалилась бы на ровном месте.
    const wantByNow = (TILT_TRADES * (i + 1)) / days.length;
    if (position.pnl < -1.1 * position.riskUsd && tilt < wantByNow) {
      let at = position.closeMs + rand(8, 50) * 60_000;
      for (let k = 0, n = randInt(2, 3); k < n; k++) {
        const tiltPos = open(d, TILT_PROFILE, rand(1.2, 1.5), at);
        positions.push(tiltPos);
        tilt++;
        at = tiltPos.closeMs + rand(5, 40) * 60_000;
      }
    }
  }

  return positions.sort((a, b) => a.entryMs - b.entryMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Рыночный контекст сделки
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Снимок рынка на входе. Значения не независимый шум: они согласованы с
 * профилем входа — иначе «Выборка» покажет, что режим рынка ни на что не
 * влияет, то есть ровно противоположное тому, ради чего этот раздел есть.
 */
function contextOf(p: Position) {
  const withTag = (name: string) => p.tags.includes(name);
  const trendUp = p.direction === 'long';

  // Контртренд и FOMO входят против режима 4ч, «по тренду» — по нему.
  const trend4h = withTag('Контртренд')
    ? trendUp
      ? 'trend_down'
      : 'trend_up'
    : withTag('По тренду')
      ? trendUp
        ? 'trend_up'
        : 'trend_down'
      : pick(['trend_up', 'trend_down', 'range', 'range']);

  // FOMO — покупка у верха диапазона: то самое «догнал уже уехавшее».
  const rangePos1h = withTag('FOMO')
    ? rand(82, 108)
    : withTag('Ретест')
      ? rand(28, 58)
      : rand(10, 95);

  return {
    basis: 'opened',
    ok: true,
    price: p.entryPrice,
    atrPct: withTag('FOMO') || withTag('Тильт') ? rand(1.6, 3.4) : rand(0.35, 2.2),
    rsi: withTag('FOMO') ? rand(64, 84) : withTag('Контртренд') ? rand(18, 38) : rand(32, 72),
    volRel: withTag('FOMO') || withTag('Пробой') ? rand(1.4, 3.2) : rand(0.5, 1.6),
    ema200Above: trend4h === 'trend_up' ? chance(0.85) : trend4h === 'trend_down' ? chance(0.15) : chance(0.5),
    ema200DistPct: rand(-9, 9),
    trend4h,
    rangePos15m: rand(0, 100),
    rangePos30m: rand(0, 100),
    rangePos1h,
    rangePos4h: rangePos1h * rand(0.7, 1.2),
    rangePos1d: rand(5, 95),
    entryQuality: p.pnl > 0 ? rand(45, 95) : rand(5, 60),
    exitQuality: p.pnl > 0 ? rand(35, 90) : rand(10, 70),
    qualityComputed: true,
    ctxVersion: CTX_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Запись
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Скрипт не читает .env сам: в контейнере DATABASE_URL приходит из compose,
  // а локально передаётся в командной строке. Разбирать .env своим парсером
  // ради одного случая — лишний способ подключиться не к той базе молча.
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL не задан. Локально: DATABASE_URL=... npx ts-node ...');
  }
  const prisma = new PrismaClient();
  const now = Date.now();

  try {
    // Пересоздание, а не дописывание: каскад по User уносит сделки, теги,
    // контексты, риски, филлы и снимки баланса разом.
    const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (existing) {
      await prisma.user.delete({ where: { id: existing.id } });
      console.log(`демо-пользователь ${DEMO_EMAIL} удалён — раскладываем заново`);
    }

    const user = await prisma.user.create({
      data: {
        email: DEMO_EMAIL,
        password: await bcrypt.hash(DEMO_PASSWORD, 10),
        name: DEMO_NAME,
        // Ключей биржи у демо нет намеренно, и это не недоделка: синхронизация
        // выбирает пользователей по `activeExchange != null`, поэтому пустое
        // поле — единственное, что гарантирует, что фоновый синк не подотрёт
        // разложенную здесь историю чужими данными.
        activeExchange: null,
      },
    });

    const tags = await Promise.all(
      TAGS.map((t) => prisma.tag.create({ data: { userId: user.id, ...t } })),
    );
    const tagId = new Map(tags.map((t) => [t.name, t.id]));

    const positions = buildPositions(now);

    let n = 0;
    for (const p of positions) {
      // Тот же формат, что собирает PositionBuilderService: `SYMBOL:side:openMs`.
      // Из него же аналитика достаёт время входа (`positions.ts`, positionOpenMs),
      // поэтому произвольный uuid здесь сломал бы всё, что считает удержание.
      const positionId = `${p.symbol}:${p.direction}:${Math.round(p.entryMs)}`;
      const closingSide = p.direction === 'long' ? 'Sell' : 'Buy';
      const openingSide = p.direction === 'long' ? 'Buy' : 'Sell';
      const createdAt = new Date(p.closeMs + 60_000);

      const tradeIds: string[] = [];
      for (let i = 0; i < p.parts.length; i++) {
        const part = p.parts[i];
        const trade = await prisma.trade.create({
          data: {
            userId: user.id,
            exchange: EXCHANGE,
            symbol: p.symbol,
            side: closingSide,
            direction: p.direction,
            qty: part.qty,
            avgEntryPrice: p.entryPrice,
            avgExitPrice: part.exitPrice,
            closedPnl: part.pnl,
            // Комиссия открытия делится по долям частей: на бирже она платится
            // один раз, и приписать её целиком каждой части значило бы утроить.
            openFee: (p.openFee * part.qty) / p.qty,
            closeFee: part.closeFee,
            leverage: p.leverage,
            stopLoss: p.stopLoss,
            orderId: `${positionId}:c${i}`,
            closedAt: new Date(part.closedAt),
            openedAt: new Date(p.entryMs),
            positionId,
            createdAt,
          },
        });
        tradeIds.push(trade.id);

        if (p.tags.length > 0) {
          await prisma.tradeTag.createMany({
            data: p.tags
              .map((name) => tagId.get(name))
              .filter((id): id is string => !!id)
              .map((id) => ({ tradeId: trade.id, tagId: id })),
            skipDuplicates: true,
          });
        }

        // Контекст и риск — только на первую часть: `collapseToPositions`
        // берёт их у неё же, а строки на остальных частях никто не прочитает.
        if (i === 0) {
          await prisma.tradeContext.create({ data: { tradeId: trade.id, ...contextOf(p) } });
          const notional = p.qty * p.entryPrice;
          await prisma.tradeRisk.create({
            data: {
              tradeId: trade.id,
              balanceAtEntry: p.balanceAtEntry,
              balanceSource: 'derived',
              exposurePct: (notional / p.balanceAtEntry) * 100,
              // Null без стопа — не «ошибка расчёта», а отсутствие плана:
              // exposurePct при этом посчитан, поэтому ok остаётся true.
              plannedRiskPct: p.stopLoss ? (p.riskUsd / p.balanceAtEntry) * 100 : null,
              ok: true,
              riskVersion: RISK_VERSION,
            },
          });
        }
      }

      // Филлы: без них раскрытая строка журнала пустая. Открытие иногда в два
      // захода — усреднение, ради которого склейка позиций и делалась.
      const openFills = chance(0.25) ? 2 : 1;
      const fills: Array<{
        side: string;
        qty: number;
        price: number;
        closedSize: number;
        execTime: Date;
        execId: string;
        orderId: string;
      }> = [];
      let openLeft = p.qty;
      for (let i = 0; i < openFills; i++) {
        const last = i === openFills - 1;
        const q = last ? openLeft : p.qty * 0.5;
        fills.push({
          side: openingSide,
          qty: q,
          price: p.entryPrice * (1 + (rnd() - 0.5) * 0.002),
          closedSize: 0,
          execTime: new Date(p.entryMs + i * rand(2, 40) * 60_000),
          execId: `${positionId}:o${i}`,
          orderId: `${positionId}:o${i}`,
        });
        openLeft -= q;
      }
      p.parts.forEach((part, i) => {
        fills.push({
          side: closingSide,
          qty: part.qty,
          price: part.exitPrice,
          closedSize: part.qty,
          execTime: new Date(part.closedAt),
          execId: `${positionId}:c${i}`,
          orderId: `${positionId}:c${i}`,
        });
      });
      await prisma.execution.createMany({
        data: fills.map((f) => ({
          userId: user.id,
          exchange: EXCHANGE,
          symbol: p.symbol,
          execType: 'Trade',
          ...f,
        })),
        skipDuplicates: true,
      });

      // Фандинг — раз в 8 часов удержания. Не косметика: он и есть цена
      // держания, которой closedPnl не показывает никогда.
      const windows = Math.floor((p.closeMs - p.entryMs) / (8 * HOUR));
      if (windows > 0) {
        await prisma.fundingFee.createMany({
          data: Array.from({ length: Math.min(windows, 12) }, (_, i) => ({
            userId: user.id,
            exchange: EXCHANGE,
            symbol: p.symbol,
            // Знак по соглашению биржи: плюс — заплатил пользователь.
            amount: p.qty * p.entryPrice * rand(-0.00008, 0.00035),
            at: new Date(p.entryMs + (i + 1) * 8 * HOUR),
            execId: `${positionId}:f${i}`,
          })),
          skipDuplicates: true,
        });
      }

      if (++n % 25 === 0) console.log(`  позиций записано: ${n}/${positions.length}`);
    }

    // История баланса: ежедневный снимок плюс два пополнения. Без неё
    // «риск в % от депозита» невычислим в принципе — считать не от чего.
    const startMs = now - DAYS * DAY;
    const deposits = new Map<number, number>([
      [DAYS - 120, 2000],
      [DAYS - 45, 1500],
    ]);
    let balance = START_BALANCE;
    let cursor = 0;
    const snapshots: Array<{ at: Date; balance: number; gap: number | null }> = [];
    for (let d = 0; d <= DAYS; d++) {
      const at = new Date(startMs + d * DAY);
      while (cursor < positions.length && positions[cursor].closeMs <= at.getTime()) {
        const p = positions[cursor++];
        balance += p.pnl - p.openFee - p.parts.reduce((s, x) => s + x.closeFee, 0);
      }
      const gap = deposits.get(d) ?? null;
      if (gap) balance += gap;
      snapshots.push({ at, balance, gap });
    }
    await prisma.balanceSnapshot.createMany({
      data: snapshots.map((s) => ({
        userId: user.id,
        exchange: EXCHANGE,
        at: s.at,
        balance: s.balance,
        source: 'snapshot',
        gap: s.gap,
      })),
      skipDuplicates: true,
    });

    // Закреплённая комбинация: карточка «связка, за которой я слежу» —
    // показать, что срез можно не только найти, но и оставить на виду.
    const pinned = ['По тренду', 'Ретест'].map((t) => tagId.get(t)!).sort();
    await prisma.savedTagCombo.create({
      // `key` — те же id, отсортированные и склеенные '|': ручка дедупликации,
      // по которой карточка находится, а не пересобирается заново.
      data: { userId: user.id, tagIds: pinned, key: pinned.join('|') },
    });

    const totalTrades = await prisma.trade.count({ where: { userId: user.id } });
    const pnl = positions.reduce(
      (s, p) => s + p.pnl - p.openFee - p.parts.reduce((x, y) => x + y.closeFee, 0),
      0,
    );
    console.log('');
    console.log(`демо-аккаунт готов: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.log(`  позиций: ${positions.length}, строк сделок: ${totalTrades}`);
    console.log(`  итог за период: ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(2)}`);
    console.log(`  баланс: $${balance.toFixed(2)} (старт $${START_BALANCE}, пополнений $3500)`);
    console.log('');
    console.log('  профиль входа        сделок    итог     винрейт   медиана удержания');
    const byProfile = new Map<string, Position[]>();
    for (const p of positions) {
      const list = byProfile.get(p.profile.id) ?? [];
      list.push(p);
      byProfile.set(p.profile.id, list);
    }
    const medHold = (list: Position[]) => {
      const h = list.map((p) => (p.closeMs - p.entryMs) / HOUR).sort((a, b) => a - b);
      return h.length ? h[Math.floor(h.length / 2)] : 0;
    };
    for (const [id, list] of [...byProfile].sort((a, b) => b[1].length - a[1].length)) {
      const net = list.reduce(
        (s, p) => s + p.pnl - p.openFee - p.parts.reduce((x, y) => x + y.closeFee, 0),
        0,
      );
      const wins = list.filter((p) => p.pnl > 0).length;
      const med = medHold(list);
      console.log(
        `  ${id.padEnd(20)} ${String(list.length).padStart(4)}  ${(net >= 0 ? '+' : '−') + '$' + Math.abs(net).toFixed(0).padStart(4)}` +
          `   ${((wins / list.length) * 100).toFixed(0).padStart(4)}%   ${med.toFixed(1).padStart(6)} ч`,
      );
    }
    console.log('');
    console.log(
      `  медиана удержания: прибыльные ${medHold(positions.filter((p) => p.pnl > 0)).toFixed(1)} ч, ` +
        `убыточные ${medHold(positions.filter((p) => p.pnl <= 0)).toFixed(1)} ч`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
