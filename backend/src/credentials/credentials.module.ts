import { Module } from '@nestjs/common';
import { CredentialsCryptoService } from './credentials-crypto.service';
import { CredentialsService } from './credentials.service';
import { LegacyCredentialsMigrationService } from './legacy-credentials-migration.service';

// Standalone module (no dependency on BybitModule or ExchangesModule) so it can
// be imported by BybitModule, TradesModule and SettingsModule without cycles.
// It only needs the ExchangeId type, which carries no runtime dependency.
@Module({
  providers: [CredentialsCryptoService, CredentialsService, LegacyCredentialsMigrationService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
