import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGO = 'aes-256-gcm';

/**
 * AES-256-GCM at-rest encryption for per-user exchange credentials.
 * One master key (CREDENTIALS_ENCRYPTION_KEY, 32 bytes hex) lives in the
 * server's .env — everything downstream of it (Bybit keys per user) lives
 * encrypted in Postgres instead of in any .env file.
 * Stored format: "<iv>:<authTag>:<ciphertext>", all hex.
 */
@Injectable()
export class CredentialsCryptoService {
  private readonly logger = new Logger(CredentialsCryptoService.name);
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const hex = configService.get<string>('CREDENTIALS_ENCRYPTION_KEY') || '';
    if (!/^[0-9a-f]{64}$/i.test(hex)) {
      this.logger.error(
        'CREDENTIALS_ENCRYPTION_KEY is missing or not a 64-char hex string. ' +
          'Generate one with: openssl rand -hex 32',
      );
    }
    this.key = Buffer.from(hex.padEnd(64, '0').slice(0, 64), 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  decrypt(payload: string): string {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    if (!ivHex || !tagHex || !dataHex) {
      throw new Error('Malformed encrypted credential payload');
    }
    const decipher = crypto.createDecipheriv(ALGO, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
