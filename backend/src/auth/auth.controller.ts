import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService, AuthResult } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { clearSessionCookie, readSessionToken, writeSessionCookie } from './session-cookie';
import { useSecureCookie } from './cookie-security';
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  OAUTH_TTL_MS,
  authorizeUrl,
  callbackUrl,
  claimsFromIdToken,
  decodeState,
  encodeState,
  exchangeCode,
  googleConfig,
  newOAuthState,
  partOrigin,
  safeNextPath,
  safeRef,
} from './google-oauth';

// Credential-guessing budget per IP. Well clear of anything a real person does
// (login is once per refresh-token lifetime) while making an online password
// search useless.
const CREDENTIAL_ATTEMPTS = { default: { limit: 10, ttl: 60_000 } };

/** Назад к форме входа той же части; `next` сохраняется, чтобы повтор вёл туда же. */
function backToForm(origin: string, next: string | undefined, error?: string): string {
  const q = new URLSearchParams({ auth: 'login' });
  if (next && next !== '/') q.set('next', next);
  if (error) q.set('error', error);
  return `${origin}/?${q.toString()}`;
}

@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(CREDENTIAL_ATTEMPTS)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    return this.respondWithTokens(req, res, result);
  }

  @Post('login')
  @Throttle(CREDENTIAL_ATTEMPTS)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    return this.respondWithTokens(req, res, result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(readSessionToken(req));
    return this.respondWithTokens(req, res, result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(readSessionToken(req));
    clearSessionCookie(req, res);
    return { success: true };
  }

  /**
   * Смена пароля из настроек профиля. Ответ — как у входа: новая пара токенов
   * этому устройству (прочие сессии сняты), кука и пользователь в теле.
   * Ограничение частоты — то же, что у входа: перебор текущего пароля здесь —
   * тот же перебор пароля.
   */
  @Post('password')
  @UseGuards(JwtAuthGuard)
  @Throttle(CREDENTIAL_ATTEMPTS)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(userId, dto);
    return this.respondWithTokens(req, res, result);
  }

  /**
   * Вход через Google, шаг 1 (спека 2026-11-05): состояние входа — в куку,
   * браузер — на Google. Кнопка формы ведёт сюда обычным переходом.
   */
  @Get('google')
  googleStart(
    @Query('next') next: unknown,
    @Query('ref') ref: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origin = partOrigin(req.hostname);
    const cfg = googleConfig();
    if (!origin || !cfg) {
      this.logger.warn('вход через Google выключен: нет GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET или FRONTEND_URL');
      return res.redirect(backToForm(origin ?? '', undefined, 'GOOGLE_FAILED'));
    }
    const st = newOAuthState(safeNextPath(next, origin), safeRef(ref));
    res.cookie(OAUTH_COOKIE, encodeState(st), {
      httpOnly: true,
      // Lax доезжает на возврате с Google: это переход верхнего уровня по GET.
      sameSite: 'lax',
      secure: useSecureCookie(),
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_TTL_MS,
    });
    return res.redirect(authorizeUrl(cfg, callbackUrl(origin), st));
  }

  /**
   * Шаг 2: Google вернул код. Сверка `state` с кукой, обмен кода, аккаунт,
   * та же кука сессии, что у входа паролем, — и назад в продукт. Любой сбой —
   * к форме с `error=GOOGLE_FAILED`, причина — в лог: человеку её не исправить.
   */
  @Get('google/callback')
  async googleCallback(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origin = partOrigin(req.hostname) ?? '';
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const saved = decodeState(cookies?.[OAUTH_COOKIE]);
    res.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });

    // Передумал на экране Google — не ошибка.
    if (query.error === 'access_denied') return res.redirect(backToForm(origin, saved?.next));

    try {
      const cfg = googleConfig();
      if (!cfg) throw new Error('нет GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
      if (!saved || typeof query.state !== 'string' || query.state !== saved.state) {
        throw new Error('state не совпал с кукой');
      }
      if (typeof query.code !== 'string') throw new Error(`Google не вернул код: ${String(query.error ?? '')}`);

      const idToken = await exchangeCode(cfg, query.code, callbackUrl(origin), saved.verifier);
      const claims = claimsFromIdToken(idToken, cfg.clientId);
      const result = await this.authService.signInWithGoogle(claims, saved.ref);
      writeSessionCookie(req, res, result.refreshToken, this.authService.refreshCookieMaxAgeMs);
      return res.redirect(`${origin}${saved.next}`);
    } catch (e) {
      this.logger.warn(`вход через Google не удался: ${e instanceof Error ? e.message : String(e)}`);
      return res.redirect(backToForm(origin, saved?.next, 'GOOGLE_FAILED'));
    }
  }

  // Sets the refresh token as an HttpOnly cookie and returns the access token
  // + public user in the JSON body. The raw refresh token never reaches JS.
  private respondWithTokens(req: Request, res: Response, result: AuthResult) {
    writeSessionCookie(req, res, result.refreshToken, this.authService.refreshCookieMaxAgeMs);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }
}
