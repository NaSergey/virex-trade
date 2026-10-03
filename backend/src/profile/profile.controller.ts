import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Put,
  Body,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AVATAR_MAX_BYTES } from './avatar';
import { PrivacyDto } from './dto/privacy.dto';
import { ProfileService } from './profile.service';

/** Файл загрузки — только то, что читается; своих типов multer в проекте нет. */
type Upload = { buffer: Buffer } | undefined;

/**
 * Своё на профиле: картинка и выключатель показа сделок. Сам профиль, и свой
 * тоже, читается по id (`ProfileByIdController`): свой профиль живёт по тому же
 * адресу, что видят другие.
 *
 * Этот контроллер зарегистрирован в модуле раньше того, у которого `GET
 * :userId`, — иначе слово `privacy` было бы принято за id игрока. Тот же
 * порядок и та же ловушка, что у `GET tournaments/rating`. Вторая страховка —
 * проверка формата UUID в сервисе: `privacy` ей не проходит и получил бы 404,
 * а не чужие данные.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('privacy')
  privacy(@CurrentUser('userId') userId: string) {
    return this.profile.privacy(userId);
  }

  @Patch('privacy')
  setPrivacy(@CurrentUser('userId') userId: string, @Body() dto: PrivacyDto) {
    return this.profile.setPrivacy(userId, dto.showTrades);
  }

  // Предел multer — тот же, что проверяет сервис: файл больше него не
  // дочитывается в память вовсе.
  @Put('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }))
  setAvatar(@CurrentUser('userId') userId: string, @UploadedFile() file: Upload) {
    return this.profile.setAvatar(userId, file?.buffer);
  }

  @Delete('avatar')
  removeAvatar(@CurrentUser('userId') userId: string) {
    return this.profile.removeAvatar(userId);
  }
}

/**
 * Профиль игрока по id — **только вошедшему** (решение владельца 2026-10-02).
 * Отменяет прежнее («профиль по ссылке открывает и гость без аккаунта»,
 * 2026-10-01): на профиле теперь видны настоящие сделки, и показывать их
 * первому встречному без аккаунта — другое решение, чем показывать их
 * пользователям продукта.
 *
 * Гость при этом не редиректится, а читает приглашение: страница `/profile/<id>`
 * по-прежнему проходит гейт `proxy.ts` и рисует «чтобы посмотреть профиль,
 * зарегистрируйтесь». То есть защита стоит здесь, на данных, а текст — на
 * странице; «страница открылась» не значит «данные уехали».
 */
@UseGuards(JwtAuthGuard)
@Controller('api/profile')
export class ProfileByIdController {
  constructor(private readonly profile: ProfileService) {}

  @Get(':userId')
  of(@Param('userId') userId: string) {
    return this.profile.overview(userId);
  }

  /**
   * Его настоящие сделки с биржи. Скрыл показ — 403, а не пустой список:
   * пустой читался бы как «не торгует».
   */
  @Get(':userId/trades')
  trades(@Param('userId') userId: string, @Query('page') page?: string) {
    return this.profile.trades(userId, Number(page) || 1);
  }
}

/**
 * Картинка профиля — единственное, что остаётся без авторизации: `<img>` не
 * несёт Bearer-токен, и закрыть её значило бы потерять аватары везде, где их
 * рисует браузер. Показывать здесь нечего, кроме самой картинки.
 *
 * Тип ответа — тот, что сервер определил по байтам при загрузке; `nosniff` и
 * пустой CSP не дают браузеру прочитать файл чем-то, кроме картинки. Кэш —
 * год: адрес несёт версию (`?v=`), и новая картинка — это новый адрес.
 *
 * ThrottlerGuard здесь не стоит намеренно: `trust proxy` у приложения не
 * включён, и за Caddy у всех запросов один адрес — лимит на IP стал бы общим
 * лимитом на всех.
 */
@Controller('api/profile')
export class AvatarController {
  constructor(private readonly profile: ProfileService) {}

  @Get(':userId/avatar')
  async avatar(@Param('userId') userId: string, @Res({ passthrough: true }) res: Response) {
    const { data, mime } = await this.profile.readAvatar(userId);
    res.set({
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Disposition': 'inline',
    });
    return new StreamableFile(Buffer.from(data));
  }
}
