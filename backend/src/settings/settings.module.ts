import { Module } from '@nestjs/common';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitModule } from '../bybit/bybit.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [CredentialsModule, BybitModule],
  controllers: [SettingsController],
})
export class SettingsModule {}
