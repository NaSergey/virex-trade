import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TelegramService } from './telegram.service';

@UseGuards(JwtAuthGuard)
@Controller('api/telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  // Is the bot configured server-side and is this user's chat linked?
  @Get('status')
  status(@CurrentUser('userId') userId: string) {
    return this.telegram.status(userId);
  }

  // One-time deep link (t.me/<bot>?start=<code>) to link the user's chat.
  @Post('link')
  link(@CurrentUser('userId') userId: string) {
    return this.telegram.createLinkCode(userId);
  }

  @Delete('link')
  unlink(@CurrentUser('userId') userId: string) {
    return this.telegram.unlink(userId);
  }

  // Manual delivery check from the app UI.
  @Post('test')
  test(@CurrentUser('userId') userId: string) {
    return this.telegram.sendTest(userId);
  }
}
