import { IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/** Латиница, цифры, дефис, 3–30 символов — то же ограничение везде вокруг слага. */
const SLUG_PATTERN = /^[a-z0-9-]{3,30}$/;

const normalize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SetReferralSlugDto {
  @Transform(normalize)
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'Ссылка может содержать только латиницу, цифры и дефис, от 3 до 30 символов',
  })
  slug: string;
}

/** Тот же формат, что при сохранении — используется для живой проверки доступности. */
export class SlugAvailableQueryDto extends SetReferralSlugDto {}
