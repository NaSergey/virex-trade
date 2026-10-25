import { Module } from '@nestjs/common';
import { ProbabilitiesController } from './probabilities.controller';
import { ProbabilitiesService } from './probabilities.service';
import { ProbabilityStatsService } from './probability-stats.service';

// PrismaModule — @Global. Расчёт идёт в worker (guard в сервисе), чтение — в api.
@Module({
  controllers: [ProbabilitiesController],
  providers: [ProbabilityStatsService, ProbabilitiesService],
})
export class ProbabilitiesModule {}
