import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CredentialsService } from '../credentials/credentials.service';
import { ExchangeRegistry } from './exchange-registry.service';
import { ExchangePositionsCacheService } from './exchange-positions-cache.service';

/**
 * Account data of whichever exchange the user currently has active.
 *
 * These used to live on /api/bybit, which stopped being accurate once an
 * account could be something other than Bybit — the Bybit controller now keeps
 * only the endpoints that are genuinely Bybit-specific.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/exchange')
export class ExchangeController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly exchanges: ExchangeRegistry,
    private readonly positionsCache: ExchangePositionsCacheService,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser('userId') userId: string) {
    const { exchange, credentials } = await this.credentials.requireActive(userId);
    const res = await this.exchanges.get(exchange).getBalance(credentials);
    return { ...res, exchange };
  }

  @Get('positions')
  async getPositions(@CurrentUser('userId') userId: string) {
    const { exchange, credentials } = await this.credentials.requireActive(userId);
    // T20 (B4): coalesced across this user's browser tabs and the background
    // sync tick — see ExchangePositionsCacheService.
    const res = await this.positionsCache.getOpenPositions(userId, exchange, credentials);
    return { ...res, exchange };
  }
}
