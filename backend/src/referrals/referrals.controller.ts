import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralsService, ReferralStats } from './referrals.service';

@Controller('api/referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /**
   * Ссылку строит фронт из своего userId (уже есть в `/auth/me`) — здесь
   * только счётчик, создавать или включать пользователю нечего.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser('userId') userId: string): Promise<ReferralStats> {
    return this.referrals.getStats(userId);
  }
}
