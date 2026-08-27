import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { METRICS, metricByKey, type MetricWindow } from './metric-catalog';
import { dayMetricValues, tradeMetricValues, type TradeRow } from './metric-values';
import { evaluate, type RuleCompliance } from './compliance';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ComplianceRow extends RuleCompliance {
  window: MetricWindow;
}

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Каталог метрик едет вместе со списком правил, а не отдельным запросом:
   * форма объявления без него всё равно не рисуется, а два запроса дали бы
   * состояние, где список уже есть, а из чего выбирать — ещё нет.
   */
  async list(userId: string) {
    const rules = await this.prisma.rule.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, metric: true, operator: true, threshold: true, active: true },
    });
    return { metrics: METRICS, rules };
  }

  async upsert(
    userId: string,
    metric: string,
    dto: { operator: 'lte' | 'gte'; threshold: number; active?: boolean },
  ) {
    if (!metricByKey(metric)) {
      throw new BadRequestException({ code: 'RULE_UNKNOWN_METRIC', message: `Unknown metric: ${metric}` });
    }
    return this.prisma.rule.upsert({
      where: { userId_metric: { userId, metric } },
      create: { userId, metric, operator: dto.operator, threshold: dto.threshold, active: dto.active ?? true },
      update: { operator: dto.operator, threshold: dto.threshold, active: dto.active ?? true },
      select: { id: true, metric: true, operator: true, threshold: true, active: true },
    });
  }

  /**
   * deleteMany, а не delete: удаление правила, которого нет, — не ошибка.
   * Пользователь мог нажать «удалить» дважды или в двух вкладках, и отвечать
   * на это пятисоткой не за что.
   */
  async remove(userId: string, metric: string) {
    await this.prisma.rule.deleteMany({ where: { userId, metric } });
    return { success: true };
  }

  async compliance(
    userId: string,
    days: number,
    tzOffsetMin: number,
  ): Promise<{ rules: ComplianceRow[] }> {
    const rules = await this.prisma.rule.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
      select: { metric: true, operator: true, threshold: true },
    });
    if (rules.length === 0) return { rules: [] };

    // days = 0 означает «вся история» — та же конвенция, что у остальных
    // запросов статистики в проекте.
    const since = days > 0 ? new Date(Date.now() - days * DAY_MS) : undefined;
    const trades = (await this.prisma.trade.findMany({
      where: { userId, ...(since ? { closedAt: { gte: since } } : {}) },
      orderBy: { closedAt: 'asc' },
      select: {
        id: true,
        closedAt: true,
        closedPnl: true,
        leverage: true,
        risk: {
          select: { exposurePct: true, plannedRiskPct: true, ok: true, balanceAtEntry: true },
        },
      },
    })) as unknown as TradeRow[];

    const out: ComplianceRow[] = [];
    for (const r of rules) {
      const def = metricByKey(r.metric);
      // Правило переживает исчезновение своей метрики при откате версии кода.
      // Ронять из-за этого весь экран соблюдения нельзя: пользователь потерял
      // бы заодно и остальные правила, которые считаются прекрасно.
      if (!def) continue;

      const spec = { metric: r.metric, operator: r.operator as 'lte' | 'gte', threshold: r.threshold };
      const values =
        def.window === 'trade'
          ? tradeMetricValues(r.metric, trades)
          : dayMetricValues(r.metric, trades, tzOffsetMin);
      out.push({ ...evaluate(spec, values), window: def.window });
    }
    return { rules: out };
  }
}
