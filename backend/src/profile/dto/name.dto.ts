import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Новое имя из настроек профиля — те же правила, что при регистрации
 * (`RegisterDto.name`): пробелы по краям срезаются до проверки, 2–40 символов.
 */
export class NameDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Имя обязательно' })
  @MinLength(2, { message: 'Имя должно быть не короче 2 символов' })
  @MaxLength(40, { message: 'Имя должно быть не длиннее 40 символов' })
  name: string;
}
