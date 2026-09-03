import { Module } from '@nestjs/common';
import { PrefsService } from './prefs.service';
import { NotificationStateService } from './notification-state.service';

/**
 * Настройки и состояние сигналов — отдельным модулем от чекеров нарочно.
 * Панель `/settings` живёт в TelegramModule и должна читать настройки, а
 * чекеры должны звать TelegramService для отправки: положи всё в один модуль —
 * получишь цикл импортов и forwardRef на ровном месте.
 *
 * PrismaModule объявлен @Global, поэтому импортировать его не нужно.
 */
@Module({
  providers: [PrefsService, NotificationStateService],
  exports: [PrefsService, NotificationStateService],
})
export class PrefsModule {}
