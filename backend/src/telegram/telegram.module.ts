import { Module } from '@nestjs/common';
import { PrefsModule } from '../notifications/prefs.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

// PrismaModule is @Global, so PrismaService is available without importing it.
@Module({
  imports: [PrefsModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
