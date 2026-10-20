import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelegramStarsService } from '../integrations/telegram/telegram-stars.service.js';
import { TelegramApiService } from '../integrations/telegram/telegram-api.service.js';
import type {
  PreCheckoutQuery,
  SuccessfulPayment,
  InvoiceMode,
} from '../integrations/telegram/telegram-stars.types.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramStarsService: TelegramStarsService,
    private readonly telegramApi: TelegramApiService,
  ) {}

  getBotToken(): string {
    return this.telegramApi.getBotToken();
  }

  async getFixedPlan() {
    return this.telegramStarsService.getStarsPlan();
  }

  async getAllPayments() {
    const payments = await this.prisma.payment.findMany({
      include: {
        student: true,
        refund: true,
        payment_intent: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return payments.map((p) => ({
      id: p.id,
      student:
        [p.student?.first_name, p.student?.last_name].filter(Boolean).join(' ') ||
        p.student?.username ||
        'Student',
      telegramUserId: p.student?.telegram_user_id.toString(),
      amount: p.amount, // Telegram Stars integer count
      currency: p.currency || 'XTR',
      provider: p.provider || 'TelegramStars',
      paymentMethod: p.payment_method || 'Stars',
      telegramPaymentChargeId: p.telegram_payment_charge_id || p.provider_payment_id,
      status: p.refund ? 'REFUNDED' : p.status,
      date: p.created_at.toLocaleString(),
    }));
  }

  async createSubscriptionPayment(studentId: string, planId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException(`Student with id ${studentId} not found`);
    }

    const intent = await this.telegramStarsService.createPaymentIntent({
      telegramUserId: student.telegram_user_id,
      studentId: student.id,
      planId,
    });

    return {
      amount: intent.amount,
      currency: intent.currency,
      paymentIntentId: intent.id,
      payload: intent.payload,
    };
  }

  async createPaymentLinkForTelegramUser(telegramUserId: bigint) {
    const student = await this.prisma.student.findUnique({
      where: { telegram_user_id: telegramUserId },
    });

    if (!student) {
      throw new NotFoundException(`Student with telegram_user_id ${telegramUserId} not found`);
    }

    return this.createSubscriptionPayment(student.id);
  }

  /**
   * Generates and dispatches a Telegram Stars invoice (sendInvoice or createInvoiceLink).
   */
  async sendStarInvoice(
    chatId: string | number | bigint,
    studentId: string,
    isRenewal = false,
    forceMode?: InvoiceMode,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    const telegramUserId = student?.telegram_user_id || BigInt(chatId.toString());

    return this.telegramStarsService.generateStarsInvoice({
      chatId,
      telegramUserId,
      studentId,
      isRenewal,
      forceMode,
    });
  }

  /**
   * Validates and responds to Telegram pre_checkout_query.
   */
  async answerPreCheckoutQuery(
    queryOrId: string | PreCheckoutQuery,
    ok = true,
    errorMessage?: string,
  ) {
    if (typeof queryOrId === 'string') {
      return this.telegramApi.answerPreCheckoutQuery(queryOrId, ok, errorMessage);
    }
    return this.telegramStarsService.validateAndAnswerPreCheckout(queryOrId);
  }

  /**
   * Processes a successful Telegram Stars payment, creates events and activates/stacks subscription.
   */
  async handleSuccessfulPayment(params: {
    studentId?: string;
    telegramUserId: bigint;
    successfulPayment: SuccessfulPayment;
  }) {
    return this.telegramStarsService.processSuccessfulPayment(params);
  }

  /**
   * Refunds a Telegram Stars payment using Telegram Bot API refundStarPayment.
   */
  async refundStarPayment(paymentId: string, reason?: string, adminEmail?: string) {
    return this.telegramStarsService.refundPayment(paymentId, reason, adminEmail);
  }

  async extendStudentSubscription(studentId: string, days: number = 30) {
    const now = new Date();
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException(`Student with id ${studentId} not found`);
    }

    const subWithDate = await this.prisma.subscription.findFirst({
      where: {
        student_id: studentId,
        current_period_end: { not: null },
      },
      orderBy: { current_period_end: 'desc' },
      include: { plan: true },
    });

    const baseDate =
      subWithDate?.current_period_end && new Date(subWithDate.current_period_end) > now
        ? new Date(subWithDate.current_period_end)
        : now;

    const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    let updatedSub;
    if (subWithDate) {
      updatedSub = await this.prisma.subscription.update({
        where: { id: subWithDate.id },
        data: {
          status: 'ACTIVE',
          current_period_end: newEnd,
          cancelled_at: null,
          expired_at: null,
        },
        include: { plan: true },
      });
    } else {
      const plan = await this.getFixedPlan();
      updatedSub = await this.prisma.subscription.create({
        data: {
          student_id: studentId,
          plan_id: plan.id,
          status: 'ACTIVE',
          started_at: now,
          current_period_start: now,
          current_period_end: newEnd,
        },
        include: { plan: true },
      });
    }

    await this.prisma.student.update({
      where: { id: studentId },
      data: { is_active: true },
    });

    this.logger.log(`✓ Subscription extended for student ${studentId} by ${days} days until ${newEnd.toISOString()}`);
    return updatedSub;
  }

  async updateStudentStatus(studentId: string, statusInput: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | boolean) {
    let targetStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

    if (typeof statusInput === 'boolean') {
      targetStatus = statusInput ? 'ACTIVE' : 'SUSPENDED';
    } else {
      targetStatus = statusInput;
    }

    const isStudentActive = targetStatus !== 'SUSPENDED';

    const student = await this.prisma.student.update({
      where: { id: studentId },
      data: { is_active: isStudentActive },
    });

    let newSubStatus: 'ACTIVE' | 'CANCELLED' = 'ACTIVE';

    if (targetStatus === 'SUSPENDED') {
      newSubStatus = 'CANCELLED';
      await this.prisma.subscription.updateMany({
        where: { student_id: studentId, status: 'ACTIVE' },
        data: { status: 'CANCELLED', cancelled_at: new Date() },
      });
    } else {
      newSubStatus = 'ACTIVE';
      const now = new Date();
      const subToActivate = await this.prisma.subscription.findFirst({
        where: { student_id: studentId, current_period_end: { not: null } },
        orderBy: { current_period_end: 'desc' },
      });

      if (subToActivate) {
        const currentEnd = new Date(subToActivate.current_period_end!);
        const validEnd = currentEnd > now ? currentEnd : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        await this.prisma.subscription.update({
          where: { id: subToActivate.id },
          data: {
            status: 'ACTIVE',
            current_period_end: validEnd,
            cancelled_at: null,
            expired_at: null,
          },
        });
      } else {
        const plan = await this.getFixedPlan();
        await this.prisma.subscription.create({
          data: {
            student_id: studentId,
            plan_id: plan.id,
            status: 'ACTIVE',
            started_at: now,
            current_period_start: now,
            current_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    this.logger.log(`✓ Student ${studentId} status set to ${targetStatus} (is_active=${isStudentActive})`);
    return {
      success: true,
      student: {
        ...student,
        telegram_user_id: student.telegram_user_id.toString(),
      },
      status: targetStatus,
      subscriptionStatus: newSubStatus,
    };
  }
}
