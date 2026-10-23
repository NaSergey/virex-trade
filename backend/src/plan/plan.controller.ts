import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { TelegramService } from '../telegram/telegram.service';
import { PlanService } from './plan.service';
import { PlanBotService } from './plan-bot.service';
import {
  BlockDto,
  CopyDayDto,
  ItemDto,
  ItemPatchDto,
  SettingsDto,
  SplitDto,
} from './dto/plan.dto';

function idParam(value: string): string {
  if (!value || value.length > 40) throw new BadRequestException('Bad id');
  return value;
}

function weekdayParam(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 6)
    throw new BadRequestException('Bad weekday');
  return n;
}

/**
 * План дня — раздел владельца на поддомене админки, под тем же двойным
 * guard'ом, что учебник; префикс `/api/admin` держит запросы вне учёта посещений.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/plan')
export class PlanController {
  constructor(
    private readonly plan: PlanService,
    private readonly bot: PlanBotService,
    private readonly telegram: TelegramService,
  ) {}

  /** GET /api/admin/plan/state — настройки, «сейчас» владельца, виды блоков, привязан ли бот. */
  @Get('state')
  async state() {
    return this.plan.state(
      this.telegram.enabled && (await this.bot.ownerChat()) != null,
    );
  }

  @Put('settings')
  saveSettings(@Body() dto: SettingsDto) {
    return this.plan.saveSettings(dto);
  }

  /** POST /api/admin/plan/test — план дня в Telegram прямо сейчас: проверить, что доходит. */
  @Post('test')
  async test() {
    const chatId = await this.bot.ownerChat();
    if (!this.telegram.enabled || !chatId)
      throw new BadRequestException('Telegram не привязан');
    const ok = await this.telegram.sendText(
      chatId,
      '🔔 План дня на связи: сюда придут напоминания о блоках, утренний план и вечерний отчёт.',
    );
    return { success: ok };
  }

  @Get('template')
  template() {
    return this.plan.template();
  }

  @Post('template')
  addBlock(@Body() dto: BlockDto) {
    return this.plan.addBlock(dto);
  }

  @Put('template/:id')
  saveBlock(@Param('id') id: string, @Body() dto: BlockDto) {
    return this.plan.saveBlock(idParam(id), dto);
  }

  @Delete('template/:id')
  deleteBlock(@Param('id') id: string) {
    return this.plan.deleteBlock(idParam(id));
  }

  /** POST /api/admin/plan/template/<id>/split — правка только для одного дня недели. */
  @Post('template/:id/split')
  splitBlock(@Param('id') id: string, @Body() dto: SplitDto) {
    const { weekday, ...fields } = dto;
    return this.plan.splitBlock(idParam(id), weekday, { ...fields, weekday });
  }

  /** DELETE /api/admin/plan/template/<id>/days/<0…6> — убрать блок из одного дня недели. */
  @Delete('template/:id/days/:weekday')
  removeFromDay(@Param('id') id: string, @Param('weekday') weekday: string) {
    return this.plan.removeFromDay(idParam(id), weekdayParam(weekday));
  }

  /** POST /api/admin/plan/template/copy-day — план дня `from` на дни `to`. */
  @Post('template/copy-day')
  copyDay(@Body() dto: CopyDayDto) {
    return this.plan.copyDay(dto.from, dto.to);
  }

  /** DELETE /api/admin/plan/template/days/<0…6> — очистить день недели. */
  @Delete('template/days/:weekday')
  clearDay(@Param('weekday') weekday: string) {
    return this.plan.clearDay(weekdayParam(weekday));
  }

  /** GET /api/admin/plan/days/<YYYY-MM-DD> — блоки дня (сегодня и дальше — из шаблона при первом открытии). */
  @Get('days/:day')
  day(@Param('day') day: string) {
    return this.plan.day(day);
  }

  @Post('days/:day/items')
  addItem(@Param('day') day: string, @Body() dto: ItemDto) {
    return this.plan.addItem(day, dto);
  }

  @Post('days/:day/rebuild')
  rebuild(@Param('day') day: string) {
    return this.plan.rebuild(day);
  }

  @Patch('items/:id')
  patchItem(@Param('id') id: string, @Body() dto: ItemPatchDto) {
    return this.plan.patchItem(idParam(id), dto);
  }

  @Delete('items/:id')
  deleteItem(@Param('id') id: string) {
    return this.plan.deleteItem(idParam(id));
  }

  /** GET /api/admin/plan/stats?days=7 — отчётность за последние N дней. */
  @Get('stats')
  stats(@Query('days') days?: string) {
    return this.plan.stats(Number(days ?? 7));
  }
}
