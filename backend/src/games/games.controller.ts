import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateGameTableDto, JoinGameTableDto } from './dto/game-table.dto';
import { GameType } from './games.config';
import { GamesService } from './games.service';

/**
 * Стол виден любому вошедшему пользователю по id: приватность держится тем,
 * что id никому не показан вне приглашения, а не проверкой членства (тот же
 * приём, что у ссылки-приглашения турнира).
 *
 * `mine`/`public` объявлены раньше `:id` — иначе Nest примет эти слова за id
 * стола.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/games/tables')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateGameTableDto) {
    return this.games.create(userId, dto);
  }

  @Get('mine')
  listMine(@CurrentUser('userId') userId: string) {
    return this.games.listMine(userId);
  }

  @Get('public')
  listPublic(@CurrentUser('userId') userId: string, @Query('gameType') gameType?: GameType) {
    return this.games.listPublic(userId, gameType);
  }

  @Get(':id')
  get(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.games.get(userId, id);
  }

  @Post(':id/join')
  join(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: JoinGameTableDto) {
    return this.games.join(userId, id, dto.buyIn);
  }

  @Post(':id/leave')
  leave(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.games.leave(userId, id);
  }

  // Право шире остальных: ещё и у владельца сервиса, поэтому сюда едет почта.
  @Delete(':id')
  close(
    @CurrentUser('userId') userId: string,
    @CurrentUser('email') email: string,
    @Param('id') id: string,
  ) {
    return this.games.close(userId, email, id);
  }
}
