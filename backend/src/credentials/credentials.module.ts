import { Module } from '@nestjs/common';
import { CredentialsCryptoService } from './credentials-crypto.service';
import { CredentialsService } from './credentials.service';

// Standalone module (no dependency on BybitModule or ExchangesModule) so it can
// be imported by ExchangesModule, TradesModule and SettingsModule without cycles.
// It only needs the ExchangeId type, which carries no runtime dependency.
@Module({
  providers: [CredentialsCryptoService, CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
