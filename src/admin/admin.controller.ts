import { Controller, Get } from '@nestjs/common';
import { TelegramStarsService } from '../integrations/telegram/telegram-stars.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly telegramStarsService: TelegramStarsService) {}

  @Public()
  @Get('health/telegram-stars')
  async getTelegramStarsHealth() {
    return this.telegramStarsService.getStarsHealth();
  }
}
