import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProbabilitiesService } from './probabilities.service';

@UseGuards(JwtAuthGuard)
@Controller('api/probabilities')
export class ProbabilitiesController {
  constructor(private readonly probabilities: ProbabilitiesService) {}

  /** Экспериментальные индикаторы терминала (спека 2026-10-25). */
  @Get()
  get() {
    return this.probabilities.get();
  }
}
