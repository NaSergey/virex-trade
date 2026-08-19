import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CredentialsService } from '../credentials/credentials.service';
import { ExchangeRegistry } from '../exchanges/exchange-registry.service';
import { EXCHANGE_CATALOG, exchangeMeta, isExchangeId } from '../exchanges/exchange-catalog';
import { ExchangeId } from '../exchanges/exchange.types';
import { ConnectExchangeDto } from './dto/connect-exchange.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/settings')
export class SettingsController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly exchanges: ExchangeRegistry,
  ) {}

  /**
   * Everything the settings page needs in one call: which exchanges exist,
   * what each one's connect form requires, which are connected, and which is
   * active. Secrets never appear — only a masked key.
   */
  @Get('exchanges')
  async listExchanges(@CurrentUser('userId') userId: string) {
    const [connections, active] = await Promise.all([
      this.credentials.list(userId),
      this.credentials.activeExchange(userId),
    ]);
    const byId = new Map(connections.map((c) => [c.exchange, c]));

    return {
      success: true,
      activeExchange: active,
      exchanges: EXCHANGE_CATALOG.map((meta) => {
        const conn = byId.get(meta.id);
        return {
          id: meta.id,
          label: meta.label,
          needsPassphrase: meta.needsPassphrase,
          permissionsHint: meta.permissionsHint,
          connected: !!conn,
          apiKeyMasked: conn?.apiKeyMasked ?? null,
          connectedAt: conn?.connectedAt ?? null,
          // Connected, but the stored secrets no longer open: the page shows
          // the connect form again instead of a key it cannot display.
          needsReconnect: conn?.needsReconnect ?? false,
        };
      }),
    };
  }

  /**
   * Connect (or replace) one exchange's keys. Validated against the exchange
   * itself before being stored, so a typo or a key without the right
   * permissions is caught here rather than on the first sync.
   */
  @Put('exchanges/:exchange')
  async connect(
    @CurrentUser('userId') userId: string,
    @Param('exchange') exchange: string,
    @Body() dto: ConnectExchangeDto,
  ) {
    const id = this.parseExchange(exchange);
    const meta = exchangeMeta(id);
    const passphrase = dto.passphrase?.trim();

    if (meta.needsPassphrase && !passphrase) {
      throw new BadRequestException(`${meta.label} требует passphrase вместе с ключом и секретом`);
    }
    // Sending one to an exchange that doesn't use it is a sign the caller has
    // the wrong form open; storing it would be dead weight in the DB.
    if (!meta.needsPassphrase && passphrase) {
      throw new BadRequestException(`${meta.label} не использует passphrase`);
    }

    const credentials = {
      apiKey: dto.apiKey,
      apiSecret: dto.apiSecret,
      ...(passphrase ? { passphrase } : {}),
    };

    const check = await this.exchanges.get(id).verifyCredentials(credentials);
    if (!check.success) {
      throw new BadRequestException(
        check.error ||
          `Не удалось подключиться к ${meta.label} с этими ключами. Проверьте их и права доступа.`,
      );
    }

    await this.credentials.save(userId, id, credentials);
    return {
      success: true,
      exchange: id,
      apiKeyMasked: this.credentials.maskKey(dto.apiKey),
      activeExchange: await this.credentials.activeExchange(userId),
    };
  }

  @Delete('exchanges/:exchange')
  async disconnect(@CurrentUser('userId') userId: string, @Param('exchange') exchange: string) {
    const id = this.parseExchange(exchange);
    await this.credentials.clear(userId, id);
    return { success: true, activeExchange: await this.credentials.activeExchange(userId) };
  }

  /** Switch which connected exchange drives sync, positions and trading. */
  @Put('active-exchange/:exchange')
  async setActive(@CurrentUser('userId') userId: string, @Param('exchange') exchange: string) {
    const id = this.parseExchange(exchange);
    await this.credentials.setActive(userId, id);
    return { success: true, activeExchange: id };
  }

  private parseExchange(value: string): ExchangeId {
    // Path params bypass the DTO pipe, so the id is validated against the
    // catalog here rather than trusted into a DB lookup.
    if (!isExchangeId(value)) {
      throw new BadRequestException(`Неизвестная биржа: ${value}`);
    }
    return value;
  }
}
