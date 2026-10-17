import { IsString, MinLength } from 'class-validator';

/** Смена пароля из настроек профиля: текущий — подтверждение, что это владелец. */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Введите текущий пароль' })
  current: string;

  /** Те же правила, что при регистрации (`RegisterDto.password`). */
  @IsString()
  @MinLength(8, { message: 'Пароль должен быть не короче 8 символов' })
  next: string;
}
