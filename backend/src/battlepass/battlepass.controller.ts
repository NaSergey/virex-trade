import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BattlePassService } from './battlepass.service';

/**
 * Battle Pass пользователя. Лестницу уровней отдаёт сервер, а не считает фронт:
 * правило начисления одно, и второй его реализации в браузере быть не должно —
 * они разойдутся при первой же правке кривой.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/battlepass')
export class BattlePassController {
  constructor(private readonly battlePass: BattlePassService) {}

  @Get()
  state(@CurrentUser('userId') userId: string) {
    return this.battlePass.state(userId);
  }

  @Post('claim')
  claim(@CurrentUser('userId') userId: string) {
    return this.battlePass.claim(userId);
  }

  @Post('daily')
  daily(@CurrentUser('userId') userId: string) {
    return this.battlePass.claimDaily(userId);
  }
}
