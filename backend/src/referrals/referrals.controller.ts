import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetReferralSlugDto, SlugAvailableQueryDto } from './dto/referral-slug.dto';
import { ReferralsService, ReferralStats } from './referrals.service';

@Controller('api/referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /**
   * Ссылку строит фронт из своего userId или, если задан, своего слага
   * (оба есть в этом ответе) — создавать или включать пользователю нечего.
   */
  @Get('me')
  me(@CurrentUser('userId') userId: string): Promise<ReferralStats> {
    return this.referrals.getStats(userId);
  }

  /** Живая проверка при вводе — свой текущий слаг не считается «занято». */
  @Get('slug-available')
  async slugAvailable(
    @CurrentUser('userId') userId: string,
    @Query() query: SlugAvailableQueryDto,
  ): Promise<{ available: boolean }> {
    return { available: await this.referrals.isSlugAvailable(query.slug, userId) };
  }

  @Put('slug')
  setSlug(
    @CurrentUser('userId') userId: string,
    @Body() dto: SetReferralSlugDto,
  ): Promise<{ slug: string }> {
    return this.referrals.setSlug(userId, dto.slug);
  }
}
