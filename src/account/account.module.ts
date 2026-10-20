import { Module } from '@nestjs/common';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
