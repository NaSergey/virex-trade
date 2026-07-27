import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetBybitKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  apiKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  apiSecret: string;
}
