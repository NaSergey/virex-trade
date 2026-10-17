import { Module } from '@nestjs/common';
import { BattlePassCoreModule } from '../battlepass/battlepass-core.module';
import { BybitModule } from '../bybit/bybit.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BybitTerminalClient } from './bybit-terminal.client';
import { EntryFollowService } from './stream/entry-follow.service';
import { EntryFollowStore } from './stream/entry-follow.store';
import { STREAM_LISTENER, StopFollowService, type StreamListener } from './stream/stop-follow.service';
import { StopFollowStore } from './stream/stop-follow.store';
import { StreamListeners } from './stream/stream-listeners';
import { STREAM_STORE, TerminalStreamService } from './stream/terminal-stream.service';
import { TerminalStreamStore } from './stream/terminal-stream.store';
import { TerminalController } from './terminal.controller';
import { TerminalMarketService } from './terminal-market.service';
import { TerminalService } from './terminal.service';

@Module({
  imports: [CredentialsModule, BybitModule, BattlePassCoreModule],
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
    // Стоп после исполнения сетки входа: строки пишет api, ведёт worker тем же потоком.
    EntryFollowStore,
    EntryFollowService,
    {
      provide: STREAM_LISTENER,
      useFactory: (takes: StopFollowService, entries: EntryFollowService): StreamListener => new StreamListeners([takes, entries]),
      inject: [StopFollowService, EntryFollowService],
    },
  ],
})
export class TerminalModule {}
