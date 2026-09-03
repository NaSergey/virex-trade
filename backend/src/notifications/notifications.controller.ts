import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrefsService } from './prefs.service';
import { Prefs, applyPatch, isEnabled } from './prefs';
import { CATEGORIES, CATEGORY_META, defsByCategory } from './registry';
import { PatchNotificationsDto } from './dto/patch-notifications.dto';

/**
 * Настройки уведомлений живут на странице настроек приложения. Форму рисует
 * фронт, но состав сигналов и их пресеты приходят отсюда — из реестра: иначе
 * список пришлось бы держать в двух местах и следить, чтобы он не разошёлся.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly prefs: PrefsService) {}

  @Get()
  async list(@CurrentUser('userId') userId: string) {
    return this.render(await this.prefs.get(userId));
  }

  @Patch()
  async patch(@CurrentUser('userId') userId: string, @Body() dto: PatchNotificationsDto) {
    const next = applyPatch(await this.prefs.get(userId), dto);
    await this.prefs.save(userId, next);
    return this.render(next);
  }

  /** Реестр вместе с текущим состоянием — ровно то, что рисует страница. */
  private render(prefs: Prefs) {
    return {
      success: true,
      quietHours: prefs.quietHours,
      categories: CATEGORIES.map((category) => ({
        key: category,
        ...CATEGORY_META[category],
        items: defsByCategory(category).map((def) => ({
          key: def.key,
          emoji: def.emoji,
          title: def.title,
          enabled: isEnabled(prefs, def.key),
          preset: prefs.items[def.key]?.preset ?? def.defaultPreset,
          presets: def.presets,
        })),
      })),
    };
  }
}
