import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/** PrismaModule глобальный, поэтому здесь не импортируется. */
@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
