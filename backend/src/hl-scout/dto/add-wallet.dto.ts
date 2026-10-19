import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Тело `POST /api/admin/hl/saved` — свой кошелёк владельца по адресу. */
export class AddWalletDto {
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, { message: 'Это не адрес кошелька' })
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
