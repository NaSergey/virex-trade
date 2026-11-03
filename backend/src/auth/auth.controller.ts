import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
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

// Credential-guessing budget per IP. Well clear of anything a real person does
// (login is once per refresh-token lifetime) while making an online password
// search useless.
const CREDENTIAL_ATTEMPTS = { default: { limit: 10, ttl: 60_000 } };

@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
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
