import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlackjackActionDto, BlackjackBetDto, BlackjackFlagsDto } from './dto/blackjack.dto';
import { BlackjackService } from './blackjack.service';

/**
 * Раунд блэкджека поверх стола из `games`. Ставки и ходы — REST, а не
 * сообщения сокета: они двигают фишки, а деньги в продукте ходят только
 * транзакцией. Сокет лишь приносит новый вид стола.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/games/tables/:id/blackjack')
export class BlackjackController {
  constructor(private readonly blackjack: BlackjackService) {}

  @Get()
  view(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.blackjack.view(userId, id);
  }

  @Post('bet')
  bet(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: BlackjackBetDto) {
    return this.blackjack.bet(userId, id, dto.amount);
  }

  @Post('action')
  act(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: BlackjackActionDto) {
    return this.blackjack.act(userId, id, dto.type);
  }

  @Post('flags')
  flags(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: BlackjackFlagsDto) {
    return this.blackjack.setFlags(userId, id, dto);
  }
}
