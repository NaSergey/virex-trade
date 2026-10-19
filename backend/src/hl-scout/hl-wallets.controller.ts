import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { HlWalletsService } from './hl-wallets.service';
import { SaveWalletDto } from './dto/save-wallet.dto';

/**
 * Кошельки Hyperliquid — раздел владельца на поддомене админки. Под тем же
 * двойным guard'ом, что аналитика пользователей; префикс `/api/admin` держит
 * эти запросы вне учёта посещений (`IGNORED_PREFIXES`).
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/hl')
export class HlWalletsController {
  constructor(private readonly wallets: HlWalletsService) {}

  /** GET /api/admin/hl/wallets — прошедшие отбор и живые, со сводкой бота. */
  @Get('wallets')
  list() {
    return this.wallets.list();
  }

  /** GET /api/admin/hl/saved — сохранённые, и выпавшие из отбора тоже. */
  @Get('saved')
  saved() {
    return this.wallets.saved();
  }

  /**
   * GET /api/admin/hl/saved/positions — открытые позиции сохранённых, вживую.
   * Объявлен раньше `saved/:address`: иначе слово `positions` ушло бы адресом.
   */
  @Get('saved/positions')
  positions() {
    return this.wallets.positions();
  }

  /** PUT /api/admin/hl/saved/<адрес> — сохранить или сменить заметку. */
  @Put('saved/:address')
  save(@Param('address') address: string, @Body() dto: SaveWalletDto) {
    return this.wallets.save(address, dto.note);
  }

  /** DELETE /api/admin/hl/saved/<адрес> — убрать из сохранённых. */
  @Delete('saved/:address')
  unsave(@Param('address') address: string) {
    return this.wallets.unsave(address);
  }
}
