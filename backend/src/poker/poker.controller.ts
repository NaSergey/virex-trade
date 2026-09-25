import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PokerActionDto, PokerFlagsDto } from './dto/poker.dto';
import { PokerService } from './poker.service';

/**
 * Раздача покера поверх стола из `games`. Действия — REST, а не сообщения
 * сокета: они двигают фишки, а деньги в продукте ходят только транзакцией.
 * Сокет лишь приносит новый вид стола.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/games/tables/:id/poker')
export class PokerController {
  constructor(private readonly poker: PokerService) {}

  @Get()
  view(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.poker.view(userId, id);
  }

  @Post('action')
  act(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: PokerActionDto) {
    const action = dto.type === 'raise' ? { type: 'raise' as const, to: dto.amount ?? 0 } : { type: dto.type };
    return this.poker.act(userId, id, action);
  }

  @Post('flags')
  flags(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: PokerFlagsDto) {
    return this.poker.setFlags(userId, id, dto);
  }
}
