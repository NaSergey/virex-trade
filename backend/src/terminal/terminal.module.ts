import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitTerminalClient } from './bybit-terminal.client';
import { TerminalController } from './terminal.controller';
import { TerminalMarketService } from './terminal-market.service';
import { TerminalService } from './terminal.service';

@Module({
  imports: [CredentialsModule, BybitModule],
  controllers: [TerminalController],
  providers: [BybitTerminalClient, TerminalMarketService, TerminalService],
})
export class TerminalModule {}
