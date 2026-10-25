import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ProbabilitiesResponse } from './types';

/** Готовые числа для терминала: строки, которые пишет worker, — без расчёта в запросе. */
@Injectable()
export class ProbabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ProbabilitiesResponse> {
    const rows = await this.prisma.probabilityStat.findMany({
      where: { key: { in: ['divergence', 'derivs', 'now'] } },
    });
    const by = new Map(rows.map((r) => [r.key, r]));
    return {
      divergence: (by.get('divergence')?.data ??
        {}) as unknown as ProbabilitiesResponse['divergence'],
      derivs: (by.get('derivs')?.data ??
        {}) as unknown as ProbabilitiesResponse['derivs'],
      now: (by.get('now')?.data ??
        []) as unknown as ProbabilitiesResponse['now'],
      computedAt: by.get('derivs')?.computedAt.toISOString() ?? null,
      nowAt: by.get('now')?.computedAt.toISOString() ?? null,
    };
  }
}
