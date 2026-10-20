import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './auth/decorators/public.decorator.js';

@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getStatus() {
    return {
      status: 'online',
      service: 'Learning Hub Backend API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: {
        content: '/api/content',
        categories: '/api/content/categories',
        media_upload: '/api/media/upload',
        telegram_status: '/api/telegram/status',
        telegram_webhook: '/api/telegram/webhook/:secretPath',
      },
    };
  }

  getHello(): string {
    return this.appService.getHello();
  }
}
