import { Module } from '@nestjs/common';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitTerminalClient } from './bybit-terminal.client';
import { STREAM_LISTENER, StopFollowService } from './stream/stop-follow.service';
import { StopFollowStore } from './stream/stop-follow.store';
import { STREAM_STORE, TerminalStreamService } from './stream/terminal-stream.service';
import { TerminalStreamStore } from './stream/terminal-stream.store';
import { TerminalController } from './terminal.controller';
import { TerminalMarketService } from './terminal-market.service';
import { TerminalService } from './terminal.service';

@Module({
  imports: [CredentialsModule, BybitModule],
  controllers: [TerminalController],
  providers: [
    BybitTerminalClient,
    TerminalMarketService,
    TerminalService,
    // Счёт из приватного WebSocket Bybit: стор — обеим ролям (api отмечает
    // спрос и читает), соединения — только worker (guard в сервисе).
    TerminalStreamStore,
    { provide: STREAM_STORE, useExisting: TerminalStreamStore },
    TerminalStreamService,
    // Стоп за тейками: план пишет api (сетка фиксации), ведёт worker по событиям потока.
    StopFollowStore,
    StopFollowService,
    { provide: STREAM_LISTENER, useExisting: StopFollowService },
  ],
})
export class TerminalModule {}
