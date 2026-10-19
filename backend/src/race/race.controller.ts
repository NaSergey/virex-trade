import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RaceJoinDto } from './dto/race.dto';
import { RaceService } from './race.service';

/**
 * Гонки. Вход и выход — REST: они двигают монеты. Руль едет сокетом
 * (`race_input`), снимки — сокетом в комнату `race:<id>`. Адрес под
 * `/api/games/*`: туда Caddy и rewrites Next уже ведут процесс игр.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/games/race')
export class RaceController {
  constructor(private readonly race: RaceService) {}

  @Get()
  view(@CurrentUser('userId') userId: string) {
    return this.race.view(userId);
  }

  @Post('join')
  join(@CurrentUser('userId') userId: string, @Body() dto: RaceJoinDto) {
    return this.race.join(userId, dto.stake, dto.car);
  }

  @Post('leave')
  leave(@CurrentUser('userId') userId: string) {
    return this.race.leave(userId);
  }
}
