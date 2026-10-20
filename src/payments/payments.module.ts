import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelegramApiService } from '../integrations/telegram/telegram-api.service.js';
import { TelegramStarsService } from '../integrations/telegram/telegram-stars.service.js';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService, TelegramApiService, TelegramStarsService],
  exports: [PaymentsService, TelegramApiService, TelegramStarsService],
})
export class PaymentsModule {}
