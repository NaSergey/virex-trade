import { Module } from '@nestjs/common';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BalanceSnapshotService } from './balance-snapshot.service';

// PrismaModule не импортируется: он объявлен @Global, и PrismaService
// инжектится где угодно без повторного импорта.
@Module({
  imports: [ExchangesModule, CredentialsModule],
  providers: [BalanceSnapshotService],
  exports: [BalanceSnapshotService],
})
export class BalanceModule {}
