import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ProbabilitiesResponse } from './types';

/** Готовые числа для терминала: строка, которую пишет worker, — без расчёта в запросе. */
@Injectable()
export class ProbabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ProbabilitiesResponse> {
    const row = await this.prisma.probabilityStat.findUnique({
      where: { key: 'divergence' },
    });
    return {
      divergence: (row?.data ??
        {}) as unknown as ProbabilitiesResponse['divergence'],
      computedAt: row?.computedAt.toISOString() ?? null,
    };
  }
}
