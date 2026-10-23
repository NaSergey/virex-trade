import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CATEGORY_IDS } from '../categories';
import { STATUSES } from '../plan-stats';

/** Не пусто и не одни пробелы. */
const FILLED = /\S/;

/** Поля блока — общие у шаблона и дня. Конец — не позже полуночи: блок через полночь делится на два. */
export class BlockFieldsDto {
  @IsInt()
  @Min(0)
  @Max(1439)
  startMin!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMin!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(FILLED)
  title!: string;

  @IsIn(CATEGORY_IDS)
  category!: string;

  @IsBoolean()
  track!: boolean;
}

/** Тело `POST/PUT /api/admin/plan/template[/<id>]`. */
export class BlockDto extends BlockFieldsDto {
  /** Дни недели битами, пн = 1 … вс = 64. */
  @IsInt()
  @Min(1)
  @Max(127)
  days!: number;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  tasks!: string[];
}

export class TaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text!: string;

  @IsBoolean()
  done!: boolean;
}

/** Тело `POST /api/admin/plan/days/<день>/items`. */
export class ItemDto extends BlockFieldsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TaskDto)
  tasks!: TaskDto[];
}

/** Тело `PATCH /api/admin/plan/items/<id>` — любое подмножество полей. */
export class ItemPatchDto {
  @IsOptional() @IsInt() @Min(0) @Max(1439) startMin?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) endMin?: number;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(FILLED)
  title?: string;
  @IsOptional() @IsIn(CATEGORY_IDS) category?: string;
  @IsOptional() @IsBoolean() track?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TaskDto)
  tasks?: TaskDto[];

  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/** Тело `PUT /api/admin/plan/settings`. Минута null — сообщение выключено. */
export class SettingsDto {
  @IsString()
  @MaxLength(64)
  tz!: string;

  @IsOptional() @IsInt() @Min(0) @Max(1439) morningMin!: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1439) eveningMin!: number | null;

  @IsInt()
  @Min(0)
  @Max(60)
  leadMin!: number;
}
