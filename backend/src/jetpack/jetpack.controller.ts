import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JetpackBetDto } from './dto/jetpack.dto';
import { JetpackService } from './jetpack.service';

/**
 * Джетпак — одна игра на всех, без столов. Ставка и вывод — REST: они
 * двигают монеты, а деньги в продукте ходят только транзакцией. Оба отвечают
 * свежим видом — кнопка не должна ждать рассылки, чтобы узнать, что ставка
 * принята. Сокет приносит вид остальным.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/jetpack')
export class JetpackController {
  constructor(private readonly jetpack: JetpackService) {}

  @Get()
  view(@CurrentUser('userId') userId: string) {
    return this.jetpack.view(userId);
  }

  @Post('bet')
  bet(@CurrentUser('userId') userId: string, @Body() dto: JetpackBetDto) {
    return this.jetpack.bet(userId, dto.amount, dto.autoCashout);
  }

  @Post('cashout')
  cashout(@CurrentUser('userId') userId: string) {
    return this.jetpack.cashout(userId);
  }
}
