import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConnectExchangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  apiKey: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  apiSecret: string;

  // Third secret for OKX/Bitget/KuCoin. Required-ness is per exchange, so it is
  // optional here and checked against the catalog entry in the controller.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  passphrase?: string;
}
