import { BadRequestException, Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CredentialsService } from '../credentials/credentials.service';
import { BybitBalanceService } from '../bybit/services/bybit-balance.service';
import { SetBybitKeysDto } from './dto/set-bybit-keys.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/settings')
export class SettingsController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly balanceService: BybitBalanceService,
  ) {}

  @Get('bybit')
  async getBybitStatus(@CurrentUser('userId') userId: string) {
    const creds = await this.credentials.get(userId);
    return {
      success: true,
      connected: !!creds,
      apiKeyMasked: creds ? this.credentials.maskKey(creds.apiKey) : null,
    };
  }

  // Validates the keys against Bybit (real balance call) before saving, so a
  // typo or read-only key is caught immediately instead of failing silently
  // the first time the bot engine tries to place an order.
  @Put('bybit')
  async setBybitKeys(@CurrentUser('userId') userId: string, @Body() dto: SetBybitKeysDto) {
    const test = await this.balanceService.getUSDTBalance({ apiKey: dto.apiKey, apiSecret: dto.apiSecret });
    if (!test.success) {
      throw new BadRequestException(
        test.error || 'Не удалось подключиться к Bybit с этими ключами. Проверьте API key/secret и права доступа.',
      );
    }
    await this.credentials.save(userId, dto.apiKey, dto.apiSecret);
    return { success: true, apiKeyMasked: this.credentials.maskKey(dto.apiKey) };
  }

  @Delete('bybit')
  async disconnectBybit(@CurrentUser('userId') userId: string) {
    await this.credentials.clear(userId);
    return { success: true };
  }
}
