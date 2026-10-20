import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [PaymentsModule],
  controllers: [AdminController],
})
export class AdminModule {}
