import { Module } from '@nestjs/common';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { AvatarController, ProfileByIdController, ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * Профиль игрока: дашборд (только чтение — сворачивает журнал монет, события
 * опыта, ставки и раздачи) и картинка профиля (`user_avatars`). Фоновых сервисов
 * нет. Рейтинг — у турниров: правило очков одно.
 *
 * PrismaModule глобальный, поэтому `PrismaService` здесь не импортируется.
 */
@Module({
  imports: [TournamentsModule],
  controllers: [ProfileController, ProfileByIdController, AvatarController],
  providers: [ProfileService],
})
export class ProfileModule {}
