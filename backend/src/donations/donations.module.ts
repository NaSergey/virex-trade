import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { DONATION_CONFIG, loadDonationConfig } from './donation.config';
import { PaymentQrService } from './payment-qr.service';
import { TronGridClient } from './tron/trongrid.client';
import { TronWatcherService } from './tron/tron-watcher.service';

/**
 * Донаты разработчику: USDT-TRC20 на один общий кошелёк проекта.
 *
 * Конфигурация читается ОДИН раз и раздаётся провайдером, а не через
 * process.env по месту: адрес кошелька проверяется по контрольной сумме при
 * старте, и половина сервисов не должна уметь прочитать его иначе. Выключенная
 * конфигурация (адрес не задан) не ломает загрузку модуля — контроллер отвечает
 * `enabled: false`, наблюдатель не запускает опрос.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется.
 */
@Module({
  imports: [TelegramModule],
  controllers: [DonationsController],
  providers: [
    { provide: DONATION_CONFIG, useFactory: loadDonationConfig },
    DonationsService,
    PaymentQrService,
    TronGridClient,
    TronWatcherService,
  ],
  exports: [DonationsService],
})
export class DonationsModule {}
