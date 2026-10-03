import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { UsageModule } from './admin/usage/usage.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { BlackjackModule } from './blackjack/blackjack.module';
import { GamesModule } from './games/games.module';
import { JetpackModule } from './jetpack/jetpack.module';
import { PokerModule } from './poker/poker.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Игры с состоянием в памяти процесса: столы покера и блэкджека, раунд
 * джетпака, их общий сокет и возврат прерванного на старте. Входят только в
 * граф роли игр (`runsGames`): здесь и в `AppModule` при `ROLE=all`.
 */
export const GAME_MODULES = [GamesModule, PokerModule, BlackjackModule, JetpackModule];

/**
 * Корень процесса `ROLE=games` (спека `2026-10-02-games-role-design.md`).
 * Только игры и то, без чего они не работают: конфиг, база, проверка
 * access-токена (`JwtStrategy` без `AuthModule` — входа и регистрации здесь
 * нет), учёт посещений и `/health` для healthcheck compose. Ни Bybit, ни синка,
 * ни телеграма: процесс не ходит к бирже и не держит их память.
 *
 * Новая зависимость игрового модуля обязана появиться и здесь — иначе DI
 * упадёт на старте контейнера; это ловит `games-app.module.spec.ts`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    PassportModule,
    UsageModule,
    ...GAME_MODULES,
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class GamesAppModule {}
