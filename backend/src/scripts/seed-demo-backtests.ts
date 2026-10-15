/**
 * Бектесты демо-аккаунта: сессии «Тренажёра» с настоящими сделками.
 *
 * Запуск отдельно (журнал демо не трогает, заменяет только сессии бектеста):
 *   npx ts-node -r tsconfig-paths/register src/scripts/seed-demo-backtests.ts
 * На проде:
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec api node dist/scripts/seed-demo-backtests.js
 * Полный прогон `seed-demo.ts` вызывает то же самое после раскладки журнала.
 *
 * Почему сделки считаются по свечам, а не рисуются. Сессию тренажёра можно
 * открыть и «продолжить»: график строит генератор по зерну сессии
 * (`SyntheticMarketService`), и входы с выходами обязаны лежать на этих же
 * свечах — иначе отметки сделок висели бы в воздухе. Поэтому каждая сделка
 * здесь — настоящий проход по свечам зерна: вход по закрытию свечи, стоп и
 * тейк от ATR, выход — первая свеча, задевшая уровень (оба в одной свече —
 * стоп, как у движка).
 *
 * Почему из пула кандидатов, а не подряд. На сгенерированном рынке простое
 * правило даёт около нуля, а витрина с нулевыми сессиями показывает «ничего
 * не работает». Поэтому сначала считается пул сделок по всему отрезку, а
 * состав сессии набирается квотой выигрышей и проигрышей (приём из
 * `seed-demo.ts`): число сделок и винрейт сессии заданы планом, а не жребием.
 * Сессии получаются разными — есть и минусовая, — но итог в плюсе.
 *
 * Это отдельное зерно со своим ГПСЧ: журнал демо (Edge Score 53) от раскладки
 * бектестов не зависит и не сдвигается.
 *
 * Два источника: «Тренажёр» (свечи строит генератор по зерну) и «История»
 * (настоящие свечи BTC из `price_candles`). История нужна не для красоты: сводка
 * «Все сессии» и таблица «По тегам» на странице бектеста считаются по реальным
 * сессиям, а тренажёр у них отдельно — без истории обе пусты. Нет свечей в
 * базе — исторические сессии пропускаются с сообщением. «Эфиру» нужен живой
 * рынок, его демо не раскладывается.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { FEE_RATE, tradeResult, type Direction, type ExitReason } from '../backtest/backtest-math';
import { SYNTH_VERSION } from '../backtest/synthetic/params';
import { SyntheticMarketService } from '../backtest/synthetic/synthetic-market.service';

const DEMO_EMAIL = 'demo@example.com';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Свеча, на которой считаются сделки. */
const TF = 15;
const BAR = TF * MINUTE;
const START_BALANCE = 10_000;
const LEVERAGE = 10;
/** Сколько свечей держим сделку, прежде чем закрыть по рынку (сутки). */
const MAX_BARS = 96;
/** Горизонт сессии от старта, дни: столько истории пускаем в пул. */
const SPAN_DAYS = 12;

interface SessionPlan {
  /** 'synthetic' — тренажёр по зерну, 'real' — отрезок настоящей истории с `startMs`. */
  source: 'synthetic' | 'real';
  /** Зерно генератора (тренажёр) или момент старта отрезка, мс UTC (история). */
  seed?: number;
  startMs?: number;
  trades: number;
  wins: number;
  /** Сколько дней назад начата. */
  daysAgo: number;
  /** Незавершённая — «Продолжить» в списке остаётся живой. */
  active?: boolean;
}

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/**
 * Десять сессий: слабые и сильные вперемешку, одна не доиграна. Винрейт — не
 * больше 70 %: сессия, где выигрыш на каждой сделке, не бывает. Отрезки
 * истории — разные эпохи рынка (падение, бык, медведь, боковик).
 */
const PLANS: SessionPlan[] = [
  { source: 'real', startMs: at(2021, 4, 12), trades: 10, wins: 6, daysAgo: 26 },
  { source: 'synthetic', seed: 417_650_912, trades: 12, wins: 7, daysAgo: 24 },
  { source: 'real', startMs: at(2020, 3, 2), trades: 8, wins: 2, daysAgo: 21 },
  { source: 'real', startMs: at(2022, 6, 6), trades: 13, wins: 7, daysAgo: 17 },
  { source: 'synthetic', seed: 1_873_002_461, trades: 7, wins: 2, daysAgo: 14 },
  { source: 'real', startMs: at(2021, 11, 8), trades: 11, wins: 7, daysAgo: 12 },
  { source: 'real', startMs: at(2023, 3, 13), trades: 9, wins: 5, daysAgo: 8 },
  { source: 'synthetic', seed: 1_041_776_628, trades: 11, wins: 7, daysAgo: 6 },
  { source: 'real', startMs: at(2024, 2, 26), trades: 12, wins: 7, daysAgo: 3 },
  { source: 'synthetic', seed: 1_692_845_190, trades: 5, wins: 3, daysAgo: 1, active: true },
];

/** Зерно ГПСЧ раскладки (не путать с зёрнами графиков в планах). */
const SEED = 7_310_913;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Bar {
  t: number; // открытие свечи, мс
  o: number;
  h: number;
  l: number;
  c: number;
}

interface Candidate {
  i: number; // индекс свечи входа
  j: number; // индекс свечи выхода
  direction: Direction;
  entryTime: number;
  exitTime: number;
  entry: number;
  stop: number;
  take: number;
  exit: number;
  reason: ExitReason;
  tags: string[];
  win: boolean;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

function atr(bars: Bar[], period: number): number[] {
  const tr = bars.map((b, i) =>
    i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)),
  );
  return ema(tr, period);
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Пул сделок по отрезку: каждые четыре свечи — вход по правилу, которое даёт
 * разметку (чем вход назван — то, по чему он и взят). Исход не выбирается: его
 * даёт путь цены.
 */
function candidates(bars: Bar[], rnd: () => number): Candidate[] {
  const closes = bars.map((b) => b.c);
  const fast = ema(closes, 20);
  const slow = ema(closes, 50);
  const range = atr(bars, 14);
  const out: Candidate[] = [];

  for (let i = 60; i < bars.length - 2; i += 4) {
    const b = bars[i];
    const a = range[i];
    if (!(a > 0)) continue;
    const trendUp = fast[i] > slow[i];
    const lookback = bars.slice(i - 32, i);
    const hi = Math.max(...lookback.map((x) => x.h));
    const lo = Math.min(...lookback.map((x) => x.l));
    const low48 = Math.min(...bars.slice(i - 48, i).map((x) => x.l));
    const high48 = Math.max(...bars.slice(i - 48, i).map((x) => x.h));

    // Правило входа и его название. Порядок — от самого «громкого» сигнала.
    let direction: Direction | null = null;
    let tags: string[] = [];
    if (b.c > hi) {
      direction = 'long';
      tags = trendUp ? ['Пробой', 'По тренду'] : ['Пробой'];
    } else if (b.c < lo) {
      direction = 'short';
      tags = !trendUp ? ['Пробой', 'По тренду'] : ['Пробой'];
    } else if (b.l <= low48 + 0.3 * a && b.c > b.o) {
      direction = 'long';
      tags = ['Отбой от уровня'];
    } else if (b.h >= high48 - 0.3 * a && b.c < b.o) {
      direction = 'short';
      tags = ['Отбой от уровня'];
    } else if (Math.abs(b.c - fast[i]) < 0.5 * a) {
      direction = trendUp ? 'long' : 'short';
      tags = ['По тренду', 'Ретест'];
    } else if (rnd() < 0.12) {
      // Против тренда — редкий вход, и в общей разметке он слабее остальных.
      direction = trendUp ? 'short' : 'long';
      tags = ['Контртренд'];
    }
    if (!direction) continue;

    const sign = direction === 'long' ? 1 : -1;
    const entry = b.c;
    const stopDist = a * (2 + rnd());
    const rr = [2, 2.5, 3][Math.floor(rnd() * 3)];
    const stop = entry - sign * stopDist;
    const take = entry + sign * stopDist * rr;

    let j = -1;
    let exit = entry;
    let reason: ExitReason = 'manual';
    const last = Math.min(bars.length - 1, i + MAX_BARS);
    for (let k = i + 1; k <= last; k++) {
      const x = bars[k];
      const hitStop = direction === 'long' ? x.l <= stop : x.h >= stop;
      const hitTake = direction === 'long' ? x.h >= take : x.l <= take;
      if (hitStop) {
        j = k;
        exit = stop;
        reason = 'stop';
        break;
      }
      if (hitTake) {
        j = k;
        exit = take;
        reason = 'take';
        break;
      }
    }
    if (j < 0) {
      j = last;
      exit = bars[last].c;
    }

    out.push({
      i,
      j,
      direction,
      entryTime: b.t + BAR,
      exitTime: bars[j].t + BAR,
      entry: round(entry, 2),
      stop: round(stop, 2),
      take: round(take, 2),
      exit: round(exit, 2),
      reason,
      tags,
      win: sign * (exit - entry) > (entry + exit) * FEE_RATE,
    });
  }
  return out;
}

/** Набирает непересекающиеся сделки: сначала выигрыши, потом проигрыши, по квоте. */
function compose(pool: Candidate[], plan: SessionPlan, rnd: () => number): Candidate[] {
  const shuffle = <T>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  };
  const chosen: Candidate[] = [];
  const free = (c: Candidate) => chosen.every((x) => c.j + 2 < x.i || c.i > x.j + 2);
  const take = (list: Candidate[], n: number) => {
    let got = 0;
    for (const c of shuffle(list)) {
      if (got >= n) break;
      if (free(c)) {
        chosen.push(c);
        got++;
      }
    }
  };
  // Разметка «Контртренд» среди выигрышей не берём — урок демо тот же, что в журнале.
  take(pool.filter((c) => c.win && !c.tags.includes('Контртренд')), plan.wins);
  take(pool.filter((c) => !c.win), plan.trades - plan.wins);
  return chosen.sort((a, b) => a.i - b.i);
}

export async function seedDemoBacktests(prisma: PrismaClient, userId: string, now = Date.now()): Promise<void> {
  const rnd = mulberry32(SEED);
  const market = new SyntheticMarketService();
  const tags = await prisma.tag.findMany({ where: { userId }, select: { id: true, name: true } });
  const tagId = new Map(tags.map((t) => [t.name, t.id]));

  for (const plan of PLANS) {
    let start: number;
    let bars: Bar[];
    if (plan.source === 'synthetic') {
      start = market.start(plan.seed!).start;
      const candles = market.getCandles(plan.seed!, {
        timeframe: TF,
        from: start,
        to: start + SPAN_DAYS * DAY,
        limit: Math.ceil((SPAN_DAYS * DAY) / BAR) + 8,
      });
      bars = candles.map((c) => ({ t: c.time.getTime(), o: c.open, h: c.high, l: c.low, c: c.close }));
    } else {
      start = plan.startMs!;
      const rows = await prisma.priceCandle.findMany({
        where: { symbol: 'BTCUSDT', timeframe: TF, time: { gte: new Date(start), lt: new Date(start + SPAN_DAYS * DAY) } },
        orderBy: { time: 'asc' },
      });
      bars = rows.map((c) => ({ t: c.time.getTime(), o: c.open, h: c.high, l: c.low, c: c.close }));
    }
    const label = plan.source === 'synthetic' ? `зерно ${plan.seed}` : `история ${new Date(start).toISOString().slice(0, 10)}`;
    if (bars.length < 200) {
      console.log(`  пропущена (${label}): свечей ${bars.length} — мало для сессии`);
      continue;
    }

    const picked = compose(candidates(bars, rnd), plan, rnd);
    const createdAt = new Date(now - plan.daysAgo * DAY - Math.floor(rnd() * 6) * HOUR);

    let balance = START_BALANCE;
    const trades = picked.map((c) => {
      // Риск — доля текущего депозита, как у панели ордера: 1 %, чаще всего.
      const riskPct = rnd() < 0.8 ? 1 : rnd() < 0.5 ? 0.5 : 2;
      const riskUsdt = (balance * riskPct) / 100;
      const qty = riskUsdt / Math.abs(c.entry - c.stop);
      const res = tradeResult({ direction: c.direction, entryPrice: c.entry, exitPrice: c.exit, qty, riskUsdt });
      balance += res.pnl;
      return { c, riskPct, riskUsdt, qty, ...res };
    });

    const lastExit = picked.length ? picked[picked.length - 1].exitTime : start;
    const session = await prisma.backtestSession.create({
      data: {
        userId,
        dataSource: plan.source,
        seed: plan.source === 'synthetic' ? plan.seed : null,
        synthVersion: plan.source === 'synthetic' ? SYNTH_VERSION : null,
        startTime: new Date(start),
        cursorTime: new Date(lastExit + (plan.active ? 2 : 1) * BAR),
        startBalance: START_BALANCE,
        balance,
        // Тренажёр прячет дату всегда (вымышленная эпоха); историю — вслепую,
        // как её и играют: узнанный отрезок подсказывает, куда пошла цена.
        hideDate: true,
        hidePrice: false,
        priceScale: 1,
        status: plan.active ? 'active' : 'finished',
        createdAt,
        finishedAt: plan.active ? null : new Date(createdAt.getTime() + (2 + Math.floor(rnd() * 3)) * HOUR),
      },
    });

    for (const t of trades) {
      const { c } = t;
      const row = await prisma.backtestTrade.create({
        data: {
          sessionId: session.id,
          symbol: 'BTCUSDT',
          direction: c.direction,
          entryTime: new Date(c.entryTime),
          entryPrice: c.entry,
          stopLoss: c.stop,
          takeProfit: c.take,
          riskPct: t.riskPct,
          riskUsdt: t.riskUsdt,
          qty: t.qty,
          leverage: LEVERAGE,
          closedQty: t.qty,
          exitTime: new Date(c.exitTime),
          exitPrice: c.exit,
          exitReason: c.reason,
          fee: t.fee,
          pnl: t.pnl,
          r: t.r,
          entries: { create: { qty: t.qty, price: c.entry, time: new Date(c.entryTime) } },
          exits: {
            create: { qty: t.qty, price: c.exit, time: new Date(c.exitTime), reason: c.reason, fee: t.fee, pnl: t.pnl },
          },
        },
      });
      const ids = c.tags.map((n) => tagId.get(n)).filter((x): x is string => !!x);
      if (ids.length) {
        await prisma.backtestTradeTag.createMany({ data: ids.map((id) => ({ tradeId: row.id, tagId: id })) });
      }
    }

    const wins = trades.filter((t) => t.pnl > 0).length;
    const pnl = balance - START_BALANCE;
    console.log(
      `  сессия ${plan.active ? '(идёт)' : '       '} ${label.padEnd(22)}: ` +
        `сделок ${trades.length}, винрейт ${trades.length ? Math.round((wins / trades.length) * 100) : 0} %, ` +
        `итог ${pnl >= 0 ? '+' : '−'}${Math.abs(pnl).toFixed(2)} USDT`,
    );
  }
}

/** Отдельный запуск: заменяет бектесты демо, журнал остаётся как был. */
async function cli() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) throw new Error(`Нет пользователя ${DEMO_EMAIL}: сначала seed-demo.ts`);
    const removed = await prisma.backtestSession.deleteMany({ where: { userId: user.id } });
    console.log(`удалено прежних сессий бектеста: ${removed.count}`);
    await seedDemoBacktests(prisma, user.id);
    console.log('бектесты демо готовы');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  cli().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
