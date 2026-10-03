import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CredentialsService } from '../credentials/credentials.service';
import { ExchangePositionsCacheService } from './exchange-positions-cache.service';

/** Открытые позиции той биржи, что сейчас активна у пользователя. */
@UseGuards(JwtAuthGuard)
@Controller('api/exchange')
export class ExchangeController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly positionsCache: ExchangePositionsCacheService,
  ) {}

  @Get('positions')
  async getPositions(@CurrentUser('userId') userId: string) {
    const { exchange, credentials } = await this.credentials.requireActive(userId);
    // T20 (B4): coalesced across this user's browser tabs and the background
    // sync tick — see ExchangePositionsCacheService.
    const res = await this.positionsCache.getOpenPositions(userId, exchange, credentials);
    return { ...res, exchange };
  }
}
