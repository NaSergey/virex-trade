import { Injectable, Logger } from '@nestjs/common';
import { BYBIT_API, bybitFetch } from '../bybit/bybit-gate';
import { PrismaService } from '../prisma/prisma.service';
import type { DerivKind } from './deriv-stats';

export const DERIV_SYMBOL = 'BTCUSDT';
/** С этого дня у Bybit есть все три ряда; фандинг начинается с середины 2020 — ранние окна пустые. */
export const SERIES_START = Date.UTC(2020, 0, 1);

const H = 3_600_000;
const Q = `category=linear&symbol=${DERIV_SYMBOL}`;

type Row = Record<string, string | undefined>;

/** Список ответа; `retCode ≠ 0` и ответ без числового `retCode` — отказ, а не пустой ряд. */
function listOf(json: unknown): Row[] {
  const j = json as {
    retCode?: unknown;
    retMsg?: unknown;
    result?: { list?: Row[] };
  } | null;
  if (typeof j?.retCode !== 'number' || j.retCode !== 0) {
    throw new Error(
      `Bybit отказал: retCode ${String(j?.retCode)} ${String(j?.retMsg ?? '')}`,
    );
  }
  return j.result?.list ?? [];
}

const num = (s: string | undefined) => (s == null ? NaN : Number(s));

interface SeriesSpec {
  /** Шаг точек ряда, мс. */
  step: number;
  /** Сколько точек отдаёт один запрос. */
  limit: number;
  url: (from: number, to: number) => string;
  parse: (json: unknown) => { time: number; value: number }[];
}

export const SERIES: Record<DerivKind, SeriesSpec> = {
  funding: {
    step: 8 * H,
    limit: 200,
    url: (a, b) =>
      `${BYBIT_API}/market/funding/history?${Q}&startTime=${a}&endTime=${b}&limit=200`,
    parse: (json) =>
      listOf(json).map((r) => ({
        time: num(r.fundingRateTimestamp),
        value: num(r.fundingRate),
      })),
  },
  ratio: {
    step: 4 * H,
    limit: 500,
    url: (a, b) =>
      `${BYBIT_API}/market/account-ratio?${Q}&period=4h&startTime=${a}&endTime=${b}&limit=500`,
    parse: (json) =>
      listOf(json).map((r) => ({
        time: num(r.timestamp),
        value: num(r.buyRatio),
      })),
  },
  oi: {
    step: 4 * H,
    limit: 200,
    url: (a, b) =>
      `${BYBIT_API}/market/open-interest?${Q}&intervalTime=4h&startTime=${a}&endTime=${b}&limit=200`,
    parse: (json) =>
      listOf(json).map((r) => ({
        time: num(r.timestamp),
        value: num(r.openInterest),
      })),
  },
};

/**
 * Окна запросов `[от, до]` (включительно) не длиннее `limit` точек ряда: каждое
 * окно — один запрос без курсора, следующее начинается через миллисекунду.
 */
export function windowsOf(
  from: number,
  now: number,
  step: number,
  limit: number,
): [number, number][] {
  const span = (limit - 1) * step;
  const out: [number, number][] = [];
  for (let a = from; a <= now; a += span + 1)
    out.push([a, Math.min(a + span, now)]);
  return out;
}

/**
 * Доливка рядов деривативов BTC в `deriv_points`. Первый прогон — с 2020 года,
 * около 140 запросов через шлюз Bybit; дальше — несколько в час. Окна пишутся
 * по порядку, поэтому сорванная доливка продолжается с последней точки.
 */
@Injectable()
export class DerivFeed {
  private readonly logger = new Logger(DerivFeed.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Сколько точек записано. Сбой ряда (шлюз, сеть, отказ биржи) — в лог; остальные ряды идут. */
  async pull(now: number): Promise<number> {
    let written = 0;
    for (const kind of Object.keys(SERIES) as DerivKind[]) {
      try {
        written += await this.pullOne(kind, now);
      } catch (e) {
        this.logger.warn(
          `ряд ${kind} не долит: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return written;
  }

  private async pullOne(kind: DerivKind, now: number): Promise<number> {
    const spec = SERIES[kind];
    const last = await this.prisma.derivPoint.findFirst({
      where: { symbol: DERIV_SYMBOL, kind },
      orderBy: { time: 'desc' },
      select: { time: true },
    });
    const from = last ? last.time.getTime() + 1 : SERIES_START;
    let written = 0;
    for (const [a, b] of windowsOf(from, now, spec.step, spec.limit)) {
      const res = await bybitFetch(spec.url(a, b));
      if (!res.ok) throw new Error(`Bybit ответил ${res.status}`);
      const points = spec
        .parse(await res.json())
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));
      if (points.length === 0) continue;
      const r = await this.prisma.derivPoint.createMany({
        data: points.map((p) => ({
          symbol: DERIV_SYMBOL,
          kind,
          time: new Date(p.time),
          value: p.value,
        })),
        skipDuplicates: true,
      });
      written += r.count;
    }
    return written;
  }
}
