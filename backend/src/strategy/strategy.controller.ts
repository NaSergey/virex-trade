import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { StrategyReportService } from './strategy-report.service';
import { STRATEGY_VERSION } from './report';
import type { ReportResponse, StrategyReport } from './report.types';

/**
 * Стратегия — раздел владельца на поддомене админки, под тем же двойным
 * guard'ом, что учебник и план.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/strategy')
export class StrategyController {
  constructor(private readonly reports: StrategyReportService) {}

  /** GET /api/admin/strategy/report — готовый отчёт или «считается». */
  @Get('report')
  async report(): Promise<ReportResponse> {
    const row = await this.reports.read();
    const computedAt = row ? row.computedAt.toISOString() : null;
    if (!row || row.version !== STRATEGY_VERSION) {
      return { status: 'pending', computedAt, report: null };
    }
    return {
      status: 'ready',
      computedAt,
      report: row.data as unknown as StrategyReport,
    };
  }
}
