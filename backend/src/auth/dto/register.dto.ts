import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Пароль должен быть не короче 8 символов' })
  password: string;

  /**
   * Имя обязательно: оно стоит в шапке и в разделе владельца рядом с почтой,
   * и аккаунт без него приходится опознавать по адресу — то есть по строке,
   * которую человек про себя не выбирал.
   *
   * Пробелы по краям срезаются до проверки, иначе один пробел проходит как
   * непустое значение и в интерфейсе оказывается пустое место.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Имя обязательно' })
  // Отдельной проверки «не одни пробелы» не нужно: их срезает Transform выше,
  // и строка из пробелов приходит сюда пустой — её отсекает та же длина.
  @MinLength(2, { message: 'Имя должно быть не короче 2 символов' })
  @MaxLength(40, { message: 'Имя должно быть не длиннее 40 символов' })
  name: string;
}
