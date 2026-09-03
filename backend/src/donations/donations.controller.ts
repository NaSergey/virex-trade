import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { DonationsService } from './donations.service';
import { CreateDonationDto } from './dto/create-donation.dto';

/**
 * Каждое создание интента занимает слот суммы из девяноста девяти, поэтому
 * эндпоинт создания ограничен по частоте — иначе один клиент в цикле выбирает
 * пул и ломает оплату остальным. Остальные методы только читают.
 */
const CREATE_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('api/donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  /** Реквизиты и границы сумм — нужно до нажатия кнопки, в том числе гостю. */
  @Get('config')
  config() {
    return this.donations.publicConfig();
  }

  /**
   * Сверка для владельца: деньги, пришедшие на кошелёк и не подошедшие ни
   * одному интенту. Маршрут объявлен ДО ':id' — иначе Nest сопоставил бы
   * «unmatched» с параметром.
   */
  @Get('unmatched')
  @UseGuards(JwtAuthGuard, AdminGuard)
  unmatched(@Query('limit') limit?: number) {
    return this.donations.unmatchedTransfers(limit ?? 50);
  }

  /** История своих донатов. */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser('userId') userId: string, @Query('limit') limit?: number) {
    return this.donations.listMine(userId, limit ?? 20);
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle(CREATE_LIMIT)
  create(
    @CurrentUser('userId') userId: string | undefined,
    @Body() dto: CreateDonationDto,
  ) {
    return this.donations.create(userId ?? null, dto.amount, dto.note);
  }

  /** Опрашивается интерфейсом, пока идёт окно оплаты. */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  get(
    @CurrentUser('userId') userId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.donations.get(id, userId ?? null);
  }

  @Post(':id/cancel')
  @UseGuards(OptionalJwtAuthGuard)
  cancel(
    @CurrentUser('userId') userId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.donations.cancel(id, userId ?? null);
  }
}
