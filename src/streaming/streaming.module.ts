import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageService } from './storage/storage.service.js';
import { TokenService } from './services/token.service.js';
import { StreamingService } from './services/streaming.service.js';
import { TelegramAuthService } from './auth/telegram-auth.service.js';
import { TranscodingService } from './services/transcoding.service.js';
import { StreamingController } from './streaming.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [StreamingController],
  providers: [
    StorageService,
    TokenService,
    StreamingService,
    TelegramAuthService,
    TranscodingService,
  ],
  exports: [
    StorageService,
    TokenService,
    StreamingService,
    TelegramAuthService,
    TranscodingService,
  ],
})
export class StreamingModule {}
