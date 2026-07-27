import { Module } from '@nestjs/common';
import { CredentialsCryptoService } from './credentials-crypto.service';
import { CredentialsService } from './credentials.service';

// Standalone module (no dependency on BybitModule) so it can be imported by
// BybitModule, TradesModule and SettingsModule without cycles.
@Module({
  providers: [CredentialsCryptoService, CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
