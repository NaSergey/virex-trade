import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { NameDto } from './dto/name.dto';
import { ProfileService } from './profile.service';

/** Файл загрузки — только то, что читается; своих типов multer в проекте нет. */
type Upload = { buffer: Buffer } | undefined;

/**
 * Своё на профиле: имя и картинка. Сам профиль, и свой тоже, читается по id
 * (`ProfileByIdController`): свой профиль живёт по тому же адресу, что видят другие.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  /** Новое имя из настроек профиля. */
  @Patch('name')
  setName(@CurrentUser('userId') userId: string, @Body() dto: NameDto) {
    return this.profile.setName(userId, dto.name);
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
/**
 * Профиль игрока по id — **только вошедшему** (решение владельца 2026-10-02).
 *
 * Гость при этом не редиректится, а читает приглашение: страница `/profile/<id>`
 * проходит гейт `proxy.ts` и рисует «чтобы посмотреть профиль, зарегистрируйтесь».
 * То есть защита стоит здесь, на данных, а текст — на странице; «страница открылась»
 * не значит «данные уехали».
 */
@UseGuards(JwtAuthGuard)
@Controller('api/profile')
export class ProfileByIdController {
  constructor(private readonly profile: ProfileService) {}

  @Get(':userId')
  of(@Param('userId') userId: string) {
    return this.profile.overview(userId);
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
 * ThrottlerGuard здесь нет. Пока `trust proxy` был выключен, он стал бы общим
 * лимитом на всех; теперь адрес настоящий (`http-proxy.ts`), и понадобится лимит —
 * его можно поставить.
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
