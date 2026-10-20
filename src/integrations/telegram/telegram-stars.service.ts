import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TelegramApiService } from './telegram-api.service.js';
import type {
  CreatePaymentIntentParams,
  PaymentIntentDto,
  PreCheckoutQuery,
  SuccessfulPayment,
  StarsHealthStatus,
  StarsPaymentResult,
  StarsRefundResult,
  InvoiceMode,
} from './telegram-stars.types.js';
import crypto from 'crypto';

@Injectable()
export class TelegramStarsService {
  private readonly logger = new Logger(TelegramStarsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramApi: TelegramApiService,
  ) {}

  getConfiguredStarsAmount(): number {
    const configured = process.env.TELEGRAM_STARS_MONTHLY_AMOUNT;
    if (configured && !isNaN(Number(configured))) {
      return parseInt(configured, 10);
    }
    return 500; // Default 500 Telegram Stars
  }

  getInvoiceMode(): InvoiceMode {
    const mode = process.env.PAYMENT_INVOICE_MODE;
    if (mode === 'createInvoiceLink') {
      return 'createInvoiceLink';
    }
    return 'sendInvoice'; // Default native sendInvoice
  }

  getStarsMode(): 'test' | 'production' {
    const mode = process.env.TELEGRAM_STARS_MODE || process.env.TELEGRAM_MODE;
    return mode?.toLowerCase() === 'test' ? 'test' : 'production';
  }

  /**
   * Retrieves or creates the default Stars subscription plan.
   */
  async getStarsPlan() {
    const amount = this.getConfiguredStarsAmount();
    let plan = await this.prisma.plan.findFirst({
      where: { name: 'All-Access Subscription', currency: 'XTR' },
    });

    if (!plan) {
      plan = await this.prisma.plan.create({
        data: {
          name: 'All-Access Subscription',
          price: amount,
          currency: 'XTR',
          interval: 'monthly',
        },
      });
    } else if (plan.price !== amount) {
      // Update plan price if env config changed
      plan = await this.prisma.plan.update({
        where: { id: plan.id },
        data: { price: amount },
      });
    }

    return plan;
  }

  /**
   * Generates a compact, unique, verifiable invoice payload.
   * Guarantees length is well below Telegram Bot API's 128-byte limit (typically ~28-32 chars).
   */
  generateShortPayload(intentId: string): string {
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const cleanId = intentId.replace(/-/g, '').slice(0, 16);
    return `sub_${cleanId}_${randomSuffix}`;
  }

  /**
   * Creates a PaymentIntent record in the database before generating Telegram invoice.
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentDto> {
    const { telegramUserId, studentId, planId, isRenewal = false } = params;
    const plan = planId
      ? await this.prisma.plan.findUnique({ where: { id: planId } })
      : await this.getStarsPlan();

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    const amount = params.amount || plan.price;
    const tgUserIdBigInt = BigInt(telegramUserId.toString());

    // Resolve student if not provided
    let resolvedStudentId = studentId;
    if (!resolvedStudentId) {
      const student = await this.prisma.student.findUnique({
        where: { telegram_user_id: tgUserIdBigInt },
      });
      if (student) resolvedStudentId = student.id;
    }

    const tempId = crypto.randomUUID();
    const payload = this.generateShortPayload(tempId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours validity

    const paymentIntent = await this.prisma.paymentIntent.create({
      data: {
        id: tempId,
        telegram_user_id: tgUserIdBigInt,
        student_id: resolvedStudentId,
        plan_id: plan.id,
        currency: 'XTR',
        amount,
        status: 'CREATED',
        payload,
        is_renewal: isRenewal,
        expires_at: expiresAt,
      },
    });

    this.logger.log(
      `[STARS] create_payment_intent | paymentIntentId=${paymentIntent.id} telegramUserId=${tgUserIdBigInt} planId=${plan.id} amount=${amount} currency=XTR`,
    );

    return {
      id: paymentIntent.id,
      telegramUserId: paymentIntent.telegram_user_id.toString(),
      studentId: paymentIntent.student_id,
      planId: paymentIntent.plan_id,
      currency: 'XTR',
      amount: paymentIntent.amount,
      status: paymentIntent.status as any,
      payload: paymentIntent.payload,
      invoiceLink: paymentIntent.invoice_link,
      isRenewal: paymentIntent.is_renewal,
      createdAt: paymentIntent.created_at,
      expiresAt: paymentIntent.expires_at,
    };
  }

  /**
   * Generates a Telegram Stars invoice either via sendInvoice or createInvoiceLink.
   */
  async generateStarsInvoice(params: {
    chatId: string | number | bigint;
    telegramUserId: string | number | bigint;
    studentId?: string;
    isRenewal?: boolean;
    forceMode?: InvoiceMode;
  }) {
    const { chatId, telegramUserId, studentId, isRenewal = false, forceMode } = params;
    const mode = forceMode || this.getInvoiceMode();

    // 1. Create PaymentIntent first
    const intent = await this.createPaymentIntent({
      telegramUserId,
      studentId,
      isRenewal,
    });

    const invoiceTitle = isRenewal
      ? 'Renew All-Access (30 Days)'
      : 'All-Access Subscription (30 Days)';
    const invoiceDescription = isRenewal
      ? 'Extend your Melcome University All-Access membership for 30 days.'
      : 'Complete 30-day access to all courses, video lectures, audio, and materials.';

    const prices = [
      {
        label: isRenewal ? '30-Day Renewal' : '30-Day All-Access',
        amount: intent.amount,
      },
    ];

    if (mode === 'createInvoiceLink') {
      // Method A: createInvoiceLink
      const response = await this.telegramApi.createInvoiceLink({
        title: invoiceTitle,
        description: invoiceDescription,
        payload: intent.payload,
        currency: 'XTR',
        prices,
        start_parameter: `star_${intent.id.slice(0, 10)}`,
      });

      if (!response.ok || !response.result) {
        this.logger.error(
          `[STARS] Failed to create invoice link for intent ${intent.id}: ${response.description}`,
        );
        await this.prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'FAILED' },
        });
        return {
          ok: false,
          mode: 'createInvoiceLink',
          intentId: intent.id,
          error: response.description,
        };
      }

      const invoiceLink = response.result;
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { invoice_link: invoiceLink, status: 'PENDING' },
      });

      this.logger.log(
        `[STARS] invoice_created | paymentIntentId=${intent.id} telegramUserId=${telegramUserId} planId=${intent.planId} amount=${intent.amount} currency=XTR link=${invoiceLink}`,
      );

      return {
        ok: true,
        mode: 'createInvoiceLink',
        intentId: intent.id,
        invoiceLink,
        amount: intent.amount,
        currency: 'XTR',
      };
    } else {
      // Method B: sendInvoice
      const response = await this.telegramApi.sendInvoice({
        chat_id: chatId,
        title: invoiceTitle,
        description: invoiceDescription,
        payload: intent.payload,
        currency: 'XTR',
        prices,
        start_parameter: `star_${intent.id.slice(0, 10)}`,
      });

      if (!response.ok) {
        this.logger.error(
          `[STARS] Failed to send native invoice to chat ${chatId} for intent ${intent.id}: ${response.description}`,
        );
        await this.prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'FAILED' },
        });
        return {
          ok: false,
          mode: 'sendInvoice',
          intentId: intent.id,
          error: response.description,
        };
      }

      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING' },
      });

      this.logger.log(
        `[STARS] invoice_sent | paymentIntentId=${intent.id} telegramUserId=${telegramUserId} planId=${intent.planId} amount=${intent.amount} currency=XTR chatId=${chatId}`,
      );

      return {
        ok: true,
        mode: 'sendInvoice',
        intentId: intent.id,
        amount: intent.amount,
        currency: 'XTR',
        message: response.result,
      };
    }
  }

  /**
   * Dedicated Handler for pre_checkout_query.
   * Performs end-to-end server validation before answering Telegram.
   */
  async validateAndAnswerPreCheckout(query: PreCheckoutQuery): Promise<{ ok: boolean; reason?: string }> {
    const { id: queryId, from, currency, total_amount, invoice_payload } = query;
    const tgUserId = from?.id ? BigInt(from.id) : null;

    this.logger.log(
      `[STARS] pre_checkout_received | queryId=${queryId} telegramUserId=${tgUserId} amount=${total_amount} currency=${currency} payload=${invoice_payload}`,
    );

    // 1. Basic format validation
    if (!queryId || !tgUserId) {
      this.logger.warn(`[STARS] pre_checkout rejected: Missing queryId or from.id`);
      await this.telegramApi.answerPreCheckoutQuery(queryId, false, 'Invalid user identity.');
      return { ok: false, reason: 'INVALID_USER' };
    }

    if (currency !== 'XTR') {
      this.logger.warn(`[STARS] pre_checkout rejected: Invalid currency ${currency}, expected XTR`);
      await this.telegramApi.answerPreCheckoutQuery(
        queryId,
        false,
        'Invalid payment currency. Melcome University accepts Telegram Stars (XTR) only.',
      );
      return { ok: false, reason: 'INVALID_CURRENCY' };
    }

    if (!invoice_payload) {
      this.logger.warn(`[STARS] pre_checkout rejected: Missing invoice payload`);
      await this.telegramApi.answerPreCheckoutQuery(queryId, false, 'Invoice payload is missing.');
      return { ok: false, reason: 'MISSING_PAYLOAD' };
    }

    // 2. Validate PaymentIntent in Database
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { payload: invoice_payload },
      include: { plan: true },
    });

    if (!paymentIntent) {
      this.logger.warn(`[STARS] pre_checkout rejected: Payment intent not found for payload ${invoice_payload}`);
      await this.telegramApi.answerPreCheckoutQuery(
        queryId,
        false,
        'Payment intent not found or expired. Please initiate a new payment.',
      );
      return { ok: false, reason: 'INTENT_NOT_FOUND' };
    }

    // 3. User verification
    if (paymentIntent.telegram_user_id !== tgUserId) {
      this.logger.warn(
        `[STARS] pre_checkout rejected: User mismatch. Intent owned by ${paymentIntent.telegram_user_id}, query from ${tgUserId}`,
      );
      await this.telegramApi.answerPreCheckoutQuery(
        queryId,
        false,
        'Payment intent does not match the active Telegram user.',
      );
      return { ok: false, reason: 'USER_MISMATCH' };
    }

    // 4. Status and expiration check
    if (paymentIntent.status === 'PAID') {
      this.logger.warn(`[STARS] pre_checkout rejected: Intent ${paymentIntent.id} is already PAID`);
      await this.telegramApi.answerPreCheckoutQuery(
        queryId,
        false,
        'This invoice has already been paid. Please check your account status.',
      );
      return { ok: false, reason: 'ALREADY_PAID' };
    }

    if (paymentIntent.status === 'REFUNDED' || paymentIntent.status === 'FAILED') {
      this.logger.warn(`[STARS] pre_checkout rejected: Intent ${paymentIntent.id} is ${paymentIntent.status}`);
      await this.telegramApi.answerPreCheckoutQuery(
        queryId,
        false,
        'This payment session is no longer valid. Please start again.',
      );
      return { ok: false, reason: 'INVALID_INTENT_STATUS' };
    }

    if (new Date() > paymentIntent.expires_at) {
      this.logger.warn(`[STARS] pre_checkout rejected: Intent ${paymentIntent.id} has expired`);
      await this.prisma.paymentIntent.update({
        where: { id: paymentIntent.id },
        data: { status: 'EXPIRED' },
      });
      await this.telegramApi.answerPreCheckoutQuery(
        queryId,
        false,
        'Invoice has expired. Please request a new subscription invoice.',
      );
      return { ok: false, reason: 'INTENT_EXPIRED' };
    }

    // 5. Amount verification
    if (paymentIntent.amount !== total_amount) {
      this.logger.warn(
        `[STARS] pre_checkout rejected: Amount mismatch. Expected ${paymentIntent.amount} XTR, got ${total_amount} XTR`,
      );
      await this.telegramApi.answerPreCheckoutQuery(
        queryId,
        false,
        'Payment amount mismatch. Please request a fresh invoice.',
      );
      return { ok: false, reason: 'AMOUNT_MISMATCH' };
    }

    // 6. Approve Pre-Checkout Query
    this.logger.log(
      `[STARS] pre_checkout_validated | paymentIntentId=${paymentIntent.id} telegramUserId=${tgUserId} amount=${total_amount} currency=XTR`,
    );

    const answerResult = await this.telegramApi.answerPreCheckoutQuery(queryId, true);
    if (!answerResult.ok) {
      this.logger.error(`[STARS] Failed to approve pre_checkout_query ${queryId}: ${answerResult.description}`);
      return { ok: false, reason: 'TELEGRAM_API_ERROR' };
    }

    this.logger.log(
      `[STARS] pre_checkout_approved | paymentIntentId=${paymentIntent.id} telegramUserId=${tgUserId} queryId=${queryId}`,
    );

    return { ok: true };
  }

  /**
   * Dedicated Handler for successful_payment.
   * Atomically records payment, enforces idempotency, updates PaymentIntent, and activates subscription.
   */
  async processSuccessfulPayment(params: {
    telegramUserId: bigint;
    successfulPayment: SuccessfulPayment;
    studentId?: string;
  }): Promise<StarsPaymentResult> {
    const { telegramUserId, successfulPayment } = params;
    const { currency, total_amount, invoice_payload, telegram_payment_charge_id } = successfulPayment;

    this.logger.log(
      `[STARS] successful_payment_received | telegramUserId=${telegramUserId} chargeId=${telegram_payment_charge_id} amount=${total_amount} currency=${currency} payload=${invoice_payload}`,
    );

    // 1. Currency check
    if (currency.toUpperCase() !== 'XTR') {
      this.logger.error(`[STARS] Non-Stars currency received: ${currency}. Expected XTR.`);
      return { success: false, reason: 'INVALID_CURRENCY' };
    }

    // 2. Strict Idempotency Guard via Telegram Payment Charge ID
    const existingPayment = await this.prisma.payment.findUnique({
      where: { telegram_payment_charge_id },
      include: { subscription: true },
    });

    if (existingPayment) {
      this.logger.log(
        `[STARS] Duplicate successful_payment ignored for chargeId ${telegram_payment_charge_id}. Payment ID: ${existingPayment.id}`,
      );
      return {
        success: true,
        isDuplicate: true,
        paymentId: existingPayment.id,
        subscriptionId: existingPayment.subscription_id || undefined,
        validUntil: existingPayment.subscription?.current_period_end || undefined,
      };
    }

    // 3. Locate PaymentIntent by payload
    let paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { payload: invoice_payload },
      include: { plan: true },
    });

    const now = new Date();

    // 4. Atomic Database Transaction
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // A. Find or Upsert Student
        let student = await tx.student.findUnique({
          where: { telegram_user_id: telegramUserId },
        });

        if (!student) {
          student = await tx.student.create({
            data: {
              telegram_user_id: telegramUserId,
              is_active: true,
            },
          });
        } else if (!student.is_active) {
          student = await tx.student.update({
            where: { id: student.id },
            data: { is_active: true },
          });
        }

        // Plan resolution
        const plan =
          paymentIntent?.plan ||
          (await tx.plan.findFirst({
            where: { name: 'All-Access Subscription', currency: 'XTR' },
          })) ||
          (await tx.plan.create({
            data: {
              name: 'All-Access Subscription',
              price: total_amount,
              currency: 'XTR',
              interval: 'monthly',
            },
          }));

        // B. One Active Subscription Rule & Validity Calculation (+30 days)
        // Find existing active subscription for student
        const existingActiveSub = await tx.subscription.findFirst({
          where: {
            student_id: student.id,
            status: 'ACTIVE',
            current_period_end: { gt: now },
          },
          orderBy: { current_period_end: 'desc' },
        });

        const baseStart =
          existingActiveSub?.current_period_end && existingActiveSub.current_period_end > now
            ? existingActiveSub.current_period_end
            : now;

        const validUntil = new Date(baseStart.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days = 2592000s

        let subscription;
        const isRenewal = Boolean(existingActiveSub);

        if (existingActiveSub) {
          // Renew / Stack existing active subscription
          subscription = await tx.subscription.update({
            where: { id: existingActiveSub.id },
            data: {
              status: 'ACTIVE',
              price: total_amount,
              current_period_end: validUntil,
              cancelled_at: null,
              expired_at: null,
            },
          });
        } else {
          // Look for any existing pending/expired subscription to reuse or create new
          const existingSub = await tx.subscription.findFirst({
            where: { student_id: student.id },
            orderBy: { created_at: 'desc' },
          });

          if (existingSub) {
            subscription = await tx.subscription.update({
              where: { id: existingSub.id },
              data: {
                status: 'ACTIVE',
                plan_id: plan.id,
                price: total_amount,
                started_at: existingSub.started_at || now,
                current_period_start: baseStart,
                current_period_end: validUntil,
                cancelled_at: null,
                expired_at: null,
              },
            });
          } else {
            subscription = await tx.subscription.create({
              data: {
                student_id: student.id,
                plan_id: plan.id,
                status: 'ACTIVE',
                price: total_amount,
                started_at: now,
                current_period_start: baseStart,
                current_period_end: validUntil,
              },
            });
          }
        }

        // C. Record Payment
        const payment = await tx.payment.create({
          data: {
            student_id: student.id,
            subscription_id: subscription.id,
            payment_intent_id: paymentIntent?.id || null,
            amount: total_amount,
            currency: 'XTR',
            status: 'SUCCESS',
            provider: 'TelegramStars',
            payment_method: 'Stars',
            provider_payment_id: telegram_payment_charge_id,
            telegram_payment_charge_id,
            paid_at: now,
          },
        });

        // D. Mark PaymentIntent as PAID
        if (paymentIntent) {
          await tx.paymentIntent.update({
            where: { id: paymentIntent.id },
            data: {
              status: 'PAID',
              student_id: student.id,
            },
          });
        }

        // E. Create PaymentEvent record
        await tx.paymentEvent.create({
          data: {
            provider_event_id: telegram_payment_charge_id,
            payment_id: payment.id,
            provider: 'TelegramStars',
            event_type: 'SUCCESSFUL_PAYMENT',
            raw_data: successfulPayment as any,
            verification_status: 'VERIFIED',
            verified_at: now,
          },
        });

        // F. Create SubscriptionRenewal record if renewed
        if (isRenewal) {
          await tx.subscriptionRenewal.create({
            data: {
              subscription_id: subscription.id,
              payment_id: payment.id,
              student_id: student.id,
              amount: total_amount,
              status: 'SUCCESS',
              previous_end_at: existingActiveSub?.current_period_end || null,
              new_end_at: validUntil,
              created_at: now,
            },
          });
        }

        // G. Create AccountAuditLog
        await tx.accountAuditLog.create({
          data: {
            admin_email: 'telegram-bot@stars.system',
            action: isRenewal ? 'SUBSCRIPTION_RENEWAL' : 'SUBSCRIPTION_ACTIVATION',
            entity: 'PAYMENT',
            entity_id: payment.id,
            new_value: {
              amount: total_amount,
              currency: 'XTR',
              chargeId: telegram_payment_charge_id,
              validUntil: validUntil.toISOString(),
              isRenewal,
            },
            reason: `Telegram Stars payment completed successfully. Access valid until ${validUntil.toISOString()}`,
          },
        });

        return { student, subscription, payment, validUntil, isRenewal };
      });

      this.logger.log(
        `[STARS] payment_recorded | paymentId=${result.payment.id} studentId=${result.student.id} amount=${total_amount} currency=XTR chargeId=${telegram_payment_charge_id}`,
      );
      this.logger.log(
        `[STARS] subscription_activated | subscriptionId=${result.subscription.id} studentId=${result.student.id} validUntil=${result.validUntil.toISOString()} isRenewal=${result.isRenewal}`,
      );

      return {
        success: true,
        paymentId: result.payment.id,
        subscriptionId: result.subscription.id,
        validUntil: result.validUntil,
        isRenewal: result.isRenewal,
      };
    } catch (err: any) {
      this.logger.error(`[STARS] Database transaction failed during payment fulfillment: ${err.message}`, err.stack);
      return { success: false, error: err.message };
    }
  }

  /**
   * Telegram Stars Refund Workflow.
   * Calls official refundStarPayment API and updates DB transactionally.
   */
  async refundPayment(
    paymentId: string,
    reason: string = 'Telegram Stars Refund',
    adminEmail?: string,
    bypassTimePolicy = false,
  ): Promise<StarsRefundResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: true, subscription: true, refund: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    if (payment.refund || payment.status === 'REFUNDED') {
      throw new BadRequestException('Refund has already been processed for this payment');
    }

    const isSuccess = payment.status === 'SUCCESS' || payment.status === 'PAID';
    if (!isSuccess) {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    // Business Policy: 5-minute window for standard student refund requests unless admin bypass
    const paidTime = payment.paid_at || payment.created_at;
    const elapsedMs = Date.now() - new Date(paidTime).getTime();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (!bypassTimePolicy && elapsedMs > fiveMinutesMs) {
      const elapsedMins = Math.round((elapsedMs / (60 * 1000)) * 10) / 10;
      throw new BadRequestException(
        `Refund policy strictly allows student refunds within the first 5 minutes only. Elapsed time: ${elapsedMins} mins.`,
      );
    }

    const chargeId = payment.telegram_payment_charge_id || payment.provider_payment_id;
    const telegramUserId = payment.student.telegram_user_id;

    if (!chargeId) {
      throw new BadRequestException('Missing telegram_payment_charge_id for Stars refund');
    }

    // Call Telegram Bot API refundStarPayment
    const tgRefundRes = await this.telegramApi.refundStarPayment(telegramUserId, chargeId);
    let tgOk = tgRefundRes.ok;

    if (!tgOk) {
      this.logger.warn(
        `[STARS] refundStarPayment API returned: ${tgRefundRes.description}. Continuing DB update if authorized.`,
      );
    }

    const now = new Date();

    // Execute atomic DB refund update
    const refundRecord = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          payment_id: payment.id,
          student_id: payment.student_id,
          amount: payment.amount,
          percentage: 100.0,
          reason,
          status: 'COMPLETED',
          provider_refund_id: `stars_rfnd_${Date.now()}_${payment.id.slice(0, 6)}`,
          requested_at: now,
          processed_at: now,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' },
      });

      if (payment.payment_intent_id) {
        await tx.paymentIntent.update({
          where: { id: payment.payment_intent_id },
          data: { status: 'REFUNDED' },
        });
      }

      if (payment.subscription_id) {
        await tx.subscription.update({
          where: { id: payment.subscription_id },
          data: {
            status: 'REFUNDED',
            cancelled_at: now,
          },
        });
      }

      await tx.accountAuditLog.create({
        data: {
          admin_email: adminEmail || 'admin@admin.com',
          action: 'ISSUE_STARS_REFUND',
          entity: 'PAYMENT',
          entity_id: payment.id,
          previous_value: { status: payment.status, amount: payment.amount },
          new_value: { status: 'REFUNDED', refundId: refund.id },
          reason: `Telegram Stars refund processed: ${payment.amount} Stars returned to user ${telegramUserId}. ${reason}`,
        },
      });

      return refund;
    });

    this.logger.log(
      `[STARS] payment_refunded | paymentId=${payment.id} studentId=${payment.student_id} amount=${payment.amount} Stars`,
    );

    return {
      success: true,
      refundId: refundRecord.id,
      paymentId: payment.id,
      telegramRefundOk: tgOk,
      amount: payment.amount,
      currency: payment.currency,
      reason,
    };
  }

  /**
   * Health Check Diagnostic Endpoint for Telegram Stars.
   */
  async getStarsHealth(): Promise<StarsHealthStatus> {
    let telegramApiStatus: 'OK' | 'ERROR' = 'ERROR';
    let botStatus: 'OK' | 'ERROR' = 'ERROR';
    let webhookStatus: 'OK' | 'ERROR' | 'NOT_SET' = 'NOT_SET';
    let dbStatus: 'OK' | 'ERROR' = 'ERROR';
    let botUsername: string | undefined;

    // 1. Check Telegram Bot API connectivity & identity
    try {
      const meRes = await this.telegramApi.getMe();
      if (meRes.ok && meRes.result) {
        telegramApiStatus = 'OK';
        botStatus = 'OK';
        botUsername = meRes.result.username;
      }
    } catch {
      telegramApiStatus = 'ERROR';
      botStatus = 'ERROR';
    }

    // 2. Check Webhook Info
    try {
      const webhookRes = await this.telegramApi.getWebhookInfo();
      if (webhookRes.ok && webhookRes.result) {
        webhookStatus = webhookRes.result.url ? 'OK' : 'NOT_SET';
      }
    } catch {
      webhookStatus = 'ERROR';
    }

    // 3. Check Database Connectivity
    try {
      await this.prisma.plan.findFirst();
      dbStatus = 'OK';
    } catch {
      dbStatus = 'ERROR';
    }

    const mode = this.getStarsMode();
    const invoiceMode = this.getInvoiceMode();
    const configuredStarsAmount = this.getConfiguredStarsAmount();
    const starsConfiguration = configuredStarsAmount > 0 ? 'OK' : 'ERROR';

    return {
      telegramApi: telegramApiStatus,
      bot: botStatus,
      webhook: webhookStatus,
      database: dbStatus,
      starsConfiguration,
      mode,
      invoiceMode,
      botUsername,
      configuredStarsAmount,
    };
  }
}
