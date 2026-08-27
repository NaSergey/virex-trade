import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RulesService } from './rules.service';
import { UpsertRuleDto } from './dto/rules.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.rules.list(userId);
  }

  // Маршрут /compliance должен быть перед /:metric, чтобы не конфликтовать
  @Get('compliance')
  compliance(
    @CurrentUser('userId') userId: string,
    @Query('days') daysStr?: string,
    @Query('tz') tzStr?: string,
  ) {
    const days = daysStr ? parseInt(daysStr, 10) : 0;
    const tz = tzStr ? parseInt(tzStr, 10) : 0;
    return this.rules.compliance(userId, days, tz);
  }

  @Put(':metric')
  upsert(
    @CurrentUser('userId') userId: string,
    @Param('metric') metric: string,
    @Body() dto: UpsertRuleDto,
  ) {
    return this.rules.upsert(userId, metric, dto);
  }

  @Delete(':metric')
  remove(@CurrentUser('userId') userId: string, @Param('metric') metric: string) {
    return this.rules.remove(userId, metric);
  }
}
