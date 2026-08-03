import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [CredentialsModule, ExchangesModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
