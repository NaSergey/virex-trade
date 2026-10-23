import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { TelegramModule } from '../telegram/telegram.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PlanBotService } from './plan-bot.service';

/**
 * План дня владельца в админке. Раздел изолирован: снаружи берёт Prisma,
 * guard'ы и транспорт бота; продукт от него не берёт ничего — снос описан в
 * `frontend/src/views/plan/README.md`.
 */
@Module({
  imports: [TelegramModule],
  controllers: [PlanController],
  providers: [PlanService, PlanBotService, AdminGuard],
})
export class PlanModule {}
