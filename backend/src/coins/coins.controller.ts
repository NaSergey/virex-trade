import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CoinsService } from './coins.service';

/**
 * Баланс монет для шапки. Отдельный крошечный эндпоинт, а не поле в `/auth/*`:
 * баланс меняется без участия человека — приз приходит, пока он на другой
 * странице, — и опрашивается своим интервалом, а профиль перечитывать незачем.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/coins')
export class CoinsController {
  constructor(private readonly coins: CoinsService) {}

  @Get()
  async get(@CurrentUser('userId') userId: string) {
    return { balance: await this.coins.balance(userId) };
  }
}
