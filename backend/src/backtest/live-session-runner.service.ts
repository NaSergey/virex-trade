import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { LiveEngineService } from './live-engine.service';

const TICK_MS = 2_000;
/** Как часто сдвигать курсор сессий, которым проверять нечего. */
const IDLE_REFRESH_MS = 60_000;

const LIVE_ACTIVE = { dataSource: 'live', status: 'active' } as const;

/** Ключ потока своей сессии в движке эфира. */
const stream = (id: string) => `s:${id}`;

/**
 * Эфир своих сессий бектеста (`dataSource = 'live'`): раз в две секунды гоняет
 * через движок эфира каждую активную сессию, где есть что исполнять, — открытую
 * сделку или уровень на вход. Каждая идёт своим курсором
 * (`BacktestSession.processedUntil`): сессии начаты в разное время, и один
 * курсор на всех сдвигал бы чужие.
 *
 * Исполнение то же, что у турнира (`TournamentRunner`), и по той же причине:
 * время идёт и у закрытой вкладки, стоп обязан сработать.
 */
@Injectable()
export class LiveSessionRunnerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LiveSessionRunnerService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  /** Потоки, которые прошлый тик вёл через движок: выпавшим снимок больше не нужен. */
  private tracked = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: LiveEngineService,
  ) {}

  onApplicationBootstrap() {
    // Фоновый сервис — только роль worker (и дефолтная all): второй экземпляр
    // исполнял бы те же уровни второй раз.
    if (!runsBackgroundJobs()) return;
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.error('тик эфира сессий упал', e as Error));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const until = Date.now();
      const sessions = await this.prisma.backtestSession.findMany({
        where: { ...LIVE_ACTIVE, OR: [{ trades: { some: { exitTime: null } } }, { entryOrders: { some: {} } }] },
        select: { id: true, processedUntil: true },
      });

      const current = new Set<string>();
      for (const s of sessions) {
        current.add(stream(s.id));
        try {
          if (await this.engine.run(stream(s.id), s.processedUntil, until, { id: s.id })) {
            // updateMany, а не update: сессию могли удалить посреди тика.
            await this.prisma.backtestSession.updateMany({
              where: { id: s.id },
              data: { processedUntil: new Date(until) },
            });
          }
        } catch (e) {
          // Одна сессия не должна лишить остальных стопов.
          this.logger.error(`тик эфира сессии ${s.id} упал`, e as Error);
        }
      }
      for (const key of this.tracked) if (!current.has(key)) this.engine.forget(key);
      this.tracked = current;

      // Сессиям без позиций и уровней проверять нечего, но курсор обязан идти:
      // иначе первый тик после входа читал бы рынок с того момента, когда
      // сессия опустела, — часы минуток ради позиции, открытой только что. Раз
      // в минуту, а не каждый тик: переписывать строки каждые две секунды незачем.
      //
      // Курсор ставится на тик раньше `until`: вход, который закоммитился уже
      // после чтения выше, датирован живой ценой чуть раньше коммита и мог
      // оказаться левее `until`. Лишние секунды до входа движку ничего не
      // стоят — `barForTrade` их пропускает, — а пропущенные стоили бы касания.
      await this.prisma.backtestSession.updateMany({
        where: {
          ...LIVE_ACTIVE,
          id: { notIn: sessions.map((s) => s.id) },
          OR: [{ processedUntil: null }, { processedUntil: { lt: new Date(until - IDLE_REFRESH_MS) } }],
        },
        data: { processedUntil: new Date(until - TICK_MS) },
      });
    } finally {
      this.busy = false;
    }
  }
}
