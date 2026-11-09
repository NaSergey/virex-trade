import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SlotsSpinDto } from './dto/slots.dto';
import { SlotsService } from './slots.service';

/** Под `/api/games/*` — тот же маршрут в процесс игр, что у гонок (Caddy и rewrites Next). */
@UseGuards(JwtAuthGuard)
@Controller('api/games/slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  config() {
    return this.slots.config();
  }

  @Post('spin')
  spin(@CurrentUser('userId') userId: string, @Body() dto: SlotsSpinDto) {
    return this.slots.spin(userId, dto.bet);
  }
}
