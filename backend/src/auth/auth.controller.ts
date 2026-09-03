import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService, AuthResult } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { ThrottleBySession } from './decorators/throttle-by-session.decorator';
import { ClientThrottlerGuard } from './guards/client-throttler.guard';
import { REFRESH_COOKIE } from './refresh-cookie';

// '/', не '/auth': кука должна доехать и до страниц продукта — её на входе
// проверяет middleware фронтенда (единственный гейт неавторизованного
// доступа), а не только сами /auth/* эндпоинты.
const REFRESH_COOKIE_PATH = '/';
// До смены пути кука ставилась на '/auth', и у всех, кто входил тогда, она
// осталась лежать в браузере рядом с новой. Браузер по RFC 6265 отдаёт первой
// ту, у которой путь длиннее, cookie-parser берёт первое значение — и на
// /auth/refresh уезжал мёртвый токен, из-за чего сессия рвалась на каждой
// перезагрузке. Сама по себе она не исчезнет: удалить куку можно только тем же
// путём, которым её ставили, поэтому каждый успешный ответ авторизации гасит
// её явно. Строку можно убрать, когда у живых пользователей её заведомо не
// осталось.
const LEGACY_REFRESH_COOKIE_PATH = '/auth';

// Credential-guessing budget per IP. Well clear of anything a real person does
// (login is once per refresh-token lifetime) while making an online password
// search useless.
const CREDENTIAL_ATTEMPTS = { default: { limit: 10, ttl: 60_000 } };

@UseGuards(ClientThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(CREDENTIAL_ATTEMPTS)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    return this.respondWithTokens(res, result);
  }

  @Post('login')
  @Throttle(CREDENTIAL_ATTEMPTS)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    return this.respondWithTokens(res, result);
  }

  @Post('refresh')
  // По сессии, а не по IP: обновление токена делает каждый живой клиент раз в
  // 15 минут, и общий на всех бюджет разлогинивал бы людей пачками.
  @ThrottleBySession()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    const result = await this.authService.refresh(raw);
    return this.respondWithTokens(res, result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    await this.authService.logout(raw);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.clearCookie(REFRESH_COOKIE, { path: LEGACY_REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }

  // Sets the refresh token as an HttpOnly cookie and returns the access token
  // + public user in the JSON body. The raw refresh token never reaches JS.
  private respondWithTokens(res: Response, result: AuthResult) {
    res.clearCookie(REFRESH_COOKIE, { path: LEGACY_REFRESH_COOKIE_PATH });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: REFRESH_COOKIE_PATH,
      maxAge: this.authService.refreshCookieMaxAgeMs,
    });

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }
}
