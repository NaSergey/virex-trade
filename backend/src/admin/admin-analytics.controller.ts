import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { AdminAnalyticsService } from './admin-analytics.service';
import {
  PeriodQueryDto,
  RetentionQueryDto,
  UsersQueryDto,
} from './dto/analytics-query.dto';

/**
 * Аналитика пользователей для владельца сервиса.
 *
 * Два guard-а по порядку: JwtAuthGuard проверяет, что запрос вообще от
 * авторизованного пользователя, AdminGuard — что этот пользователь в
 * ADMIN_EMAILS. Здесь видны почты и поведение всех, поэтому обычного токена
 * мало.
 *
 * Сами эти запросы в статистику не попадают (см. isTrackedPath): владелец,
 * читающий отчёт, — не пользователь продукта.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('api/admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  /**
   * Сводка: аудитория (DAU/WAU/MAU), время на сайте, воронка пути, график по
   * дням и разбивка по разделам.
   *
   * GET /api/admin/analytics/overview?days=30&tzOffsetMinutes=180
   */
  @Get('overview')
  async overview(@Query() query: PeriodQueryDto) {
    return this.analytics.overview(query);
  }

  /**
   * Таблица пользователей: кто, когда заходил в последний раз, сколько времени
   * провёл за окно и до чего дошёл в продукте.
   *
   * GET /api/admin/analytics/users?days=30&sort=minutesOnSite&order=desc&limit=50
   */
  @Get('users')
  async users(@Query() query: UsersQueryDto) {
    return this.analytics.users(query);
  }

  /**
   * Один пользователь: сессии, дни, разделы, состояние аккаунта.
   *
   * GET /api/admin/analytics/users/<id>?days=30
   */
  @Get('users/:id')
  async user(@Param('id') id: string, @Query() query: PeriodQueryDto) {
    return this.analytics.userDetail(id, query);
  }

  /**
   * Удержание по когортам регистрации: возвращаются ли люди на следующей неделе.
   *
   * GET /api/admin/analytics/retention?weeks=8
   */
  @Get('retention')
  async retention(@Query() query: RetentionQueryDto) {
    return this.analytics.retention(query);
  }
}
