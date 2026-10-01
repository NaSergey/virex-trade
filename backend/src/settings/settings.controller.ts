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
import { ExchangePositionsCacheService } from '../exchanges/exchange-positions-cache.service';
import {
  EXCHANGE_CATALOG,
  exchangeMeta,
  isExchangeId,
} from '../exchanges/exchange-catalog';
import { ExchangeId } from '../exchanges/exchange.types';
import { ConnectExchangeDto } from './dto/connect-exchange.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/settings')
export class SettingsController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly exchanges: ExchangeRegistry,
    private readonly positionsCache: ExchangePositionsCacheService,
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
      throw new BadRequestException({
        message: `${meta.label} требует passphrase вместе с ключом и секретом`,
        code: 'PASSPHRASE_REQUIRED',
        params: { label: meta.label },
      });
    }
    // Sending one to an exchange that doesn't use it is a sign the caller has
    // the wrong form open; storing it would be dead weight in the DB.
    if (!meta.needsPassphrase && passphrase) {
      throw new BadRequestException({
        message: `${meta.label} не использует passphrase`,
        code: 'PASSPHRASE_NOT_SUPPORTED',
        params: { label: meta.label },
      });
    }

    const credentials = {
      apiKey: dto.apiKey,
      apiSecret: dto.apiSecret,
      ...(passphrase ? { passphrase } : {}),
    };

    const check = await this.exchanges.get(id).verifyCredentials(credentials);
    if (!check.success) {
      // check.error — сырой ответ биржи (её собственный текст, обычно
      // по-английски): переводить нечем и незачем, он и так конкретен. Без
      // него — наш общий текст, у него есть code.
      if (check.error) throw new BadRequestException(check.error);
      throw new BadRequestException({
        message: `Не удалось подключиться к ${meta.label} с этими ключами. Проверьте их и права доступа.`,
        code: 'EXCHANGE_VERIFY_FAILED',
        params: { label: meta.label },
      });
    }

    // Whatever the key may do, it is stored: a key that can trade or withdraw
    // used to be refused here, and the owner dropped the refusal (2026-09-30)
    // — it kept people from connecting at all. The rights are shown on the
    // settings page instead (see permissions() below).
    await this.credentials.save(userId, id, credentials);
    // T20 (B4): drop the cached creds/active-exchange snapshot right now — the
    // activeExchange() read below, and the very next positions/balance poll,
    // must see this connection instead of whatever was cached up to
    // CREDENTIALS_CACHE_TTL_MS ago (within this process — see that constant's
    // comment for the worker-process caveat).
    this.credentials.invalidate(userId);
    // T20 fix (review, Important #2): connect() also covers rotating the key
    // of an already-active exchange (not just adding/switching one) — without
    // this, the positions cache could keep serving a snapshot fetched under
    // the old key for up to its own TTL.
    this.positionsCache.invalidate(userId, id);
    return {
      success: true,
      exchange: id,
      apiKeyMasked: this.credentials.maskKey(dto.apiKey),
      activeExchange: await this.credentials.activeExchange(userId),
      permissions: check.permissions ?? null,
    };
  }

  /**
   * What the connected key may do, as the exchange reports it right now.
   *
   * Its own endpoint rather than a field of the list above: the answer costs a
   * call to the exchange, and the settings page should not wait on it to draw.
   * `null` is "unknown" — the exchange is not asked, did not answer, or is not
   * connected — and the page must not show it as read-only.
   */
  @Get('exchanges/:exchange/permissions')
  async permissions(
    @CurrentUser('userId') userId: string,
    @Param('exchange') exchange: string,
  ) {
    const id = this.parseExchange(exchange);
    const credentials = await this.credentials.get(userId, id);
    const permissions = credentials
      ? await this.exchanges.get(id).getKeyPermissions?.(credentials)
      : undefined;
    return { success: true, exchange: id, permissions: permissions ?? null };
  }

  @Delete('exchanges/:exchange')
  async disconnect(
    @CurrentUser('userId') userId: string,
    @Param('exchange') exchange: string,
  ) {
    const id = this.parseExchange(exchange);
    await this.credentials.clear(userId, id);
    // T20 (B4): same as connect() — the deleted (or reassigned) active
    // exchange must be visible immediately, not after the cache's TTL.
    this.credentials.invalidate(userId);
    this.positionsCache.invalidate(userId, id);
    return {
      success: true,
      activeExchange: await this.credentials.activeExchange(userId),
    };
  }

  /** Switch which connected exchange drives sync, positions and trading. */
  @Put('active-exchange/:exchange')
  async setActive(
    @CurrentUser('userId') userId: string,
    @Param('exchange') exchange: string,
  ) {
    const id = this.parseExchange(exchange);
    await this.credentials.setActive(userId, id);
    // T20 (B4): the next positions/balance read must resolve to `id`, not the
    // exchange that was active before this call.
    this.credentials.invalidate(userId);
    this.positionsCache.invalidate(userId, id);
    return { success: true, activeExchange: id };
  }

  private parseExchange(value: string): ExchangeId {
    // Path params bypass the DTO pipe, so the id is validated against the
    // catalog here rather than trusted into a DB lookup.
    if (!isExchangeId(value)) {
      throw new BadRequestException({
        message: `Неизвестная биржа: ${value}`,
        code: 'EXCHANGE_UNKNOWN',
        params: { exchange: value },
      });
    }
    return value;
  }
}
