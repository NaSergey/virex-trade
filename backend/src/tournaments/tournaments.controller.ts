import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTournamentDto, JoinDto, MoveTeamDto, ReadyDto } from './dto/tournament.dto';
import { TournamentsService } from './tournaments.service';

/**
 * Турнир видит любой вошедший пользователь со ссылкой: ссылка и есть
 * приглашение, отдельного инвайт-кода нет (тот же довод, что у реферальной
 * ссылки). Закрытым турнир делает не проверка доступа, а отсутствие в общем
 * списке.
 *
 * `board`, `rating` и `feed` объявлены раньше `:id` — иначе Nest примет эти
 * слова за идентификатор турнира.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/tournaments')
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateTournamentDto) {
    return this.tournaments.create(userId, dto);
  }

  /** Общая таблица турниров: свои и чужие публичные — см. `TournamentsService.board`. */
  @Get('board')
  board(@CurrentUser('userId') userId: string) {
    return this.tournaments.board(userId);
  }

  /** Лента сделок идущих турниров — см. `TournamentsService.feed`. */
  @Get('feed')
  feed(@CurrentUser('userId') userId: string) {
    return this.tournaments.feed(userId);
  }

  @Get(':id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.get(userId, id);
  }

  /** Сделки одного турнира — блок «Сделки» в его окне. */
  @Get(':id/trades')
  trades(@Param('id') id: string) {
    return this.tournaments.trades(id);
  }

  /** У командного турнира в теле — команда (`{ team: 0 | 1 }`). */
  @Post(':id/join')
  join(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: JoinDto) {
    return this.tournaments.join(userId, id, dto.team);
  }

  /** Создатель переставляет игрока в другую команду — только в наборе. */
  @Post(':id/team')
  moveTeam(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: MoveTeamDto) {
    return this.tournaments.moveTeam(userId, id, dto.userId, dto.team);
  }

  @Post(':id/leave')
  leave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.leave(userId, id);
  }

  /**
   * Готовность участника. Отдельной команды «начать» нет: турнир выходит из
   * лобби сам, когда готовы все, — см. `TournamentsService.setReady`.
   */
  @Post(':id/ready')
  ready(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: ReadyDto,
  ) {
    return this.tournaments.setReady(userId, id, dto.ready);
  }

  // Право шире остальных: ещё и у владельца сервиса, поэтому сюда едет почта.
  @Post(':id/finish')
  finish(
    @CurrentUser('userId') userId: string,
    @CurrentUser('email') email: string,
    @Param('id') id: string,
  ) {
    return this.tournaments.finishEarly(userId, email, id);
  }

  @Delete(':id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tournaments.remove(userId, id);
  }
}

/**
 * Рейтинг игры — вошедшему; его строка приходит за пределами таблицы (`me`).
 *
 * Без авторизации он был открыт ровно ради гостевого профиля, а профиль с
 * 2026-10-02 требует входа — и публичный эндпоинт, переживший свою причину,
 * это поверхность без владельца. Гостя теперь не пускает `JwtAuthGuard`, а не
 * `OptionalJwtAuthGuard`, отдававший таблицу кому угодно.
 *
 * Отдельный контроллер остаётся: его `GET rating` обязан встать раньше `GET
 * :id` турниров, иначе слово `rating` было бы принято за id турнира.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/tournaments')
export class TournamentRatingController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get('rating')
  rating(@CurrentUser('userId') userId: string | undefined) {
    return this.tournaments.rating(userId);
  }
}
