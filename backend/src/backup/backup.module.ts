import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { DbBackupService } from './db-backup.service';

// PrismaModule — @Global, PrismaService доступен без импорта.
@Module({
  imports: [TelegramModule],
  providers: [DbBackupService],
})
export class BackupModule {}
