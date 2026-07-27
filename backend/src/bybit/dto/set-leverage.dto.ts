import { IsString, IsNotEmpty } from 'class-validator';

export class SetLeverageDto {
  @IsString()
  @IsNotEmpty()
  symbol: string;

  // Leverage as a string (e.g. "10"); validated/clamped against the
  // instrument's leverageFilter on the client and by Bybit on the server.
  @IsString()
  @IsNotEmpty()
  leverage: string;
}
