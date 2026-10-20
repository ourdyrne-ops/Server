import { Controller, Post, Get, Body, BadRequestException, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { TelegramStarsService } from '../integrations/telegram/telegram-stars.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly telegramStarsService: TelegramStarsService,
  ) {}

  @Get()
  async getAllPayments() {
    return this.paymentsService.getAllPayments();
  }

  @Public()
  @Get('plan')
  async getPlan() {
    const plan = await this.paymentsService.getFixedPlan();
    return {
      name: plan.name,
      price: plan.price, // Telegram Stars (XTR)
      currency: plan.currency,
      interval: plan.interval,
      description: 'Complete 30-day access to all courses, lessons, and materials via Telegram Stars.',
    };
  }

  @Public()
  @Get('health')
  async getHealth() {
    return this.telegramStarsService.getStarsHealth();
  }

  @Public()
  @Post('send-invoice')
  async sendInvoice(
    @Body()
    body: {
      studentId: string;
      chatId: string | number;
      isRenewal?: boolean;
      forceMode?: 'sendInvoice' | 'createInvoiceLink';
    },
  ) {
    if (!body.studentId || !body.chatId) {
      throw new BadRequestException('studentId and chatId are required');
    }
    return this.paymentsService.sendStarInvoice(
      body.chatId,
      body.studentId,
      Boolean(body.isRenewal),
      body.forceMode,
    );
  }

  @Public()
  @Post('create-intent')
  async createIntent(
    @Body()
    body: {
      telegramUserId: string | number;
      studentId?: string;
      planId?: string;
      isRenewal?: boolean;
    },
  ) {
    if (!body.telegramUserId) {
      throw new BadRequestException('telegramUserId is required');
    }
    return this.telegramStarsService.createPaymentIntent({
      telegramUserId: body.telegramUserId,
      studentId: body.studentId,
      planId: body.planId,
      isRenewal: body.isRenewal,
    });
  }

  @Public()
  @Post('create-payment')
  async createPayment(@Body() body: { studentId?: string; telegramUserId?: string | number }) {
    if (body.telegramUserId) {
      return this.paymentsService.createPaymentLinkForTelegramUser(BigInt(body.telegramUserId));
    }
    if (body.studentId) {
      return this.paymentsService.createSubscriptionPayment(body.studentId);
    }
    throw new BadRequestException('Either studentId or telegramUserId is required');
  }

  @Post('refund')
  async processRefund(@Body() body: { paymentId: string; reason?: string }) {
    if (!body.paymentId) {
      throw new BadRequestException('paymentId is required');
    }
    return this.paymentsService.refundStarPayment(body.paymentId, body.reason);
  }
}
