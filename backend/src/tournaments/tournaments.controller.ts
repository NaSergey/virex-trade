import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTournamentDto } from './dto/tournament.dto';
import { TournamentsService } from './tournaments.service';

/**
 * Турнир видит любой вошедший пользователь со ссылкой: ссылка и есть
 * приглашение, отдельного инвайт-кода нет (тот же довод, что у реферальной
 * ссылки). Закрытым турнир делает не проверка доступа, а отсутствие в общем
 * списке.
 *
 * `public` и `rating` объявлены раньше `:id` — иначе Nest примет эти слова за
 * идентификатор турнира.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/tournaments')
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateTournamentDto) {
    return this.tournaments.create(userId, dto);
  }

  @Get()
  listMine(@CurrentUser('userId') userId: string) {
    return this.tournaments.listMine(userId);
  }

  @Get('public')
  listPublic() {
    return this.tournaments.listPublic();
  }

  @Get('rating')
  rating(@CurrentUser('userId') userId: string) {
    return this.tournaments.rating(userId);
  }

  @Get(':id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.get(userId, id);
  }

  @Post(':id/join')
  join(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.join(userId, id);
  }

  @Post(':id/leave')
  leave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.leave(userId, id);
  }

  @Post(':id/start')
  start(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.start(userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.remove(userId, id);
  }
}
