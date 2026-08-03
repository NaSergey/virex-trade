import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

@Module({
  imports: [
    PassportModule,
    // Secret/expiry are passed explicitly at sign time in AuthService so they
    // are read after ConfigModule has loaded .env.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokenCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
