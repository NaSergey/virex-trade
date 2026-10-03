import { Module } from '@nestjs/common';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { TradesModule } from '../trades/trades.module';
import { AvatarController, ProfileByIdController, ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * Профиль игрока: дашборд (только чтение — сворачивает журнал монет, события
 * опыта, ставки, раздачи и настоящие сделки), выключатель их показа и картинка
 * профиля (`user_avatars`). Фоновых сервисов нет. Рейтинг — у турниров:
 * правило очков одно.
 *
 * Порядок контроллеров значим: `ProfileController` с литеральным `privacy`
 * обязан встать раньше `ProfileByIdController` с его `GET :userId`, иначе
 * слово `privacy` было бы принято за id игрока.
 *
 * Сделки читаются прямым запросом с собственным `select`, а не через
 * `TradesService`: публичный набор полей должен быть назван здесь, иначе поле,
 * добавленное журналу, приехало бы на чужой профиль само. `TradesModule`
 * импортируется только ради общего LRU-кэша агрегатов — он один на процесс, и
 * свой второй кэш означал бы второй потолок памяти, про который надо помнить.
 *
 * PrismaModule глобальный, поэтому `PrismaService` и `DataVersionService`
 * здесь не импортируются.
 */
@Module({
  imports: [TournamentsModule, TradesModule],
  controllers: [ProfileController, ProfileByIdController, AvatarController],
  providers: [ProfileService],
})
export class ProfileModule {}
