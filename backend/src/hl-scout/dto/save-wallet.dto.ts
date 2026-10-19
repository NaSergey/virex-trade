import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Тело `PUT /api/admin/hl/saved/:address`; без `note` прежняя заметка не трогается. */
export class SaveWalletDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
