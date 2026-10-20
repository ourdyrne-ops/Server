import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as crypto from 'crypto';
import {
  FunnelEventType,
  TelegramMessage,
  TelegramPreCheckoutQuery,
  TelegramSuccessfulPayment,
} from '../interfaces/sales.interfaces.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';

export interface CreateOrderParams {
  telegramUserId: bigint | number;
  bundleId: string;
  campaignId?: string;
  sessionId?: string;
}

export interface InvoiceDetails {
  orderId: string;
  orderNumber: string;
  title: string;
  description: string;
  payload: string;
  currency: string;
  priceStars: number;
}

@Injectable()
export class StarsPaymentService {
  private readonly logger = new Logger(StarsPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  getBotToken(): string {
    return (
      process.env.SALES_BOT_TOKEN ||
      '8891888818:AAFQ4Q_HFXSO6QC4KbuRJ39z-vi8JC6-gOk'
    );
  }

  async createOrder(params: CreateOrderParams): Promise<InvoiceDetails> {
    const { telegramUserId, bundleId, campaignId, sessionId } = params;
    const tgId = BigInt(telegramUserId);

    const bundle = await this.prisma.courseBundle.findUnique({
      where: { id: bundleId },
    });

    if (!bundle) {
      throw new Error(`Course bundle ${bundleId} not found`);
    }

    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${randomSuffix}`;
    const invoicePayload = `xtr_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const idempotencyKey = `ik_${tgId}_${bundle.id}_${Date.now()}`;

    const order = await this.prisma.salesOrder.create({
      data: {
        order_number: orderNumber,
        telegram_user_id: tgId,
        bundle_id: bundle.id,
        campaign_id: campaignId,
        session_id: sessionId,
        amount_stars: bundle.price_stars,
        currency: 'XTR',
        status: 'PENDING',
        invoice_payload: invoicePayload,
        idempotency_key: idempotencyKey,
      },
    });

    await this.analytics.trackEvent(FunnelEventType.CHECKOUT_INITIATED, {
      telegramUserId: tgId,
      campaignId,
      sessionId,
      metadata: {
        orderId: order.id,
        orderNumber: order.order_number,
        amountStars: bundle.price_stars,
        bundleSlug: bundle.slug,
      },
    });

    this.logger.log(
      `SalesOrder created: ${order.order_number} for user ${tgId} (${bundle.price_stars} Stars)`
    );

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      title: `${bundle.name} (30 Days)`,
      description: bundle.description.slice(0, 250),
      payload: invoicePayload,
      currency: 'XTR',
      priceStars: bundle.price_stars,
    };
  }

  async handlePreCheckoutQuery(query: TelegramPreCheckoutQuery): Promise<{ ok: boolean; errorMessage?: string }> {
    const tgUserId = BigInt(query.from.id);
    const payload = query.invoice_payload;
    const totalAmount = query.total_amount;
    const currency = query.currency;

    this.logger.log(
      `Received pre_checkout_query ${query.id} from user ${tgUserId} (payload: ${payload})`
    );

    const order = await this.prisma.salesOrder.findUnique({
      where: { invoice_payload: payload },
      include: { bundle: true },
    });

    if (!order) {
      this.logger.warn(`Pre-checkout rejected: Order not found for payload ${payload}`);
      await this.answerPreCheckout(query.id, false, 'Order not found. Please initiate checkout again.');
      return { ok: false, errorMessage: 'Order not found' };
    }

    if (currency !== 'XTR') {
      this.logger.warn(`Pre-checkout rejected: Invalid currency ${currency}`);
      await this.answerPreCheckout(query.id, false, 'Invalid currency. Must be XTR.');
      return { ok: false, errorMessage: 'Invalid currency' };
    }

    if (totalAmount !== order.amount_stars) {
      this.logger.warn(`Pre-checkout rejected: Amount mismatch ${totalAmount} vs expected ${order.amount_stars}`);
      await this.answerPreCheckout(query.id, false, 'Amount mismatch. Please try again.');
      return { ok: false, errorMessage: 'Amount mismatch' };
    }

    if (order.status === 'PAID' || order.status === 'ACTIVATED') {
      this.logger.warn(`Pre-checkout rejected: Order ${order.order_number} already paid`);
      await this.answerPreCheckout(query.id, false, 'This order has already been paid and activated.');
      return { ok: false, errorMessage: 'Order already paid' };
    }

    if (order.telegram_user_id !== tgUserId) {
      this.logger.warn(`Pre-checkout rejected: User mismatch ${tgUserId} vs ${order.telegram_user_id}`);
      await this.answerPreCheckout(query.id, false, 'User account mismatch.');
      return { ok: false, errorMessage: 'User mismatch' };
    }

    // Approve pre-checkout query
    await this.answerPreCheckout(query.id, true);

    await this.analytics.trackEvent(FunnelEventType.PRE_CHECKOUT_VALIDATED, {
      telegramUserId: tgUserId,
      campaignId: order.campaign_id || undefined,
      sessionId: order.session_id || undefined,
      metadata: { orderNumber: order.order_number, amount: totalAmount },
    });

    this.logger.log(`Pre-checkout query ${query.id} APPROVED for order ${order.order_number}`);
    return { ok: true };
  }

  async handleSuccessfulPayment(payment: TelegramSuccessfulPayment, message: TelegramMessage) {
    const payload = payment.invoice_payload;
    const chargeId = payment.telegram_payment_charge_id;
    const providerChargeId = payment.provider_payment_charge_id;
    const fromUser = message.from;
    const tgUserId = fromUser ? BigInt(fromUser.id) : BigInt(0);

    this.logger.log(
      `Processing successful_payment: chargeId=${chargeId}, payload=${payload}, user=${tgUserId}`
    );

    // 1. Idempotency Check: check if already processed by telegram_payment_charge_id
    if (chargeId) {
      const existingPayment = await this.prisma.salesOrder.findUnique({
        where: { telegram_payment_charge_id: chargeId },
        include: { bundle: true, provisioning_job: true },
      });

      if (existingPayment && (existingPayment.status === 'PAID' || existingPayment.status === 'ACTIVATED')) {
        this.logger.log(
          `Idempotent hit: Payment for chargeId ${chargeId} was already processed. Returning existing record.`
        );
        return {
          order: existingPayment,
          isDuplicate: true,
          provisioningLink: existingPayment.provisioning_job?.activation_link,
        };
      }
    }

    // 2. Fetch Order by payload
    const order = await this.prisma.salesOrder.findUnique({
      where: { invoice_payload: payload },
      include: { bundle: true },
    });

    if (!order) {
      this.logger.error(`Critical error: Successful payment received for non-existent payload: ${payload}`);
      throw new Error(`Order not found for payload ${payload}`);
    }

    // 3. Update Order to PAID
    const updatedOrder = await this.prisma.salesOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        telegram_payment_charge_id: chargeId,
        provider_payment_charge_id: providerChargeId,
        paid_at: new Date(),
      },
      include: { bundle: true },
    });

    // 4. Create internal payment record for revenue accounting
    try {
      // Find or create student stub if exists
      const student = await this.prisma.student.findUnique({
        where: { telegram_user_id: tgUserId },
      });

      if (student) {
        await this.prisma.payment.create({
          data: {
            student_id: student.id,
            provider: 'TelegramStars',
            telegram_payment_charge_id: chargeId,
            provider_payment_id: providerChargeId,
            payment_method: 'Stars',
            amount: payment.total_amount,
            currency: 'XTR',
            status: 'SUCCESS',
            paid_at: new Date(),
          },
        });
      }
    } catch (e: any) {
      this.logger.warn(`Could not sync to central Payment table: ${e.message}`);
    }

    // 5. Trigger Provisioning
    const provisioningResult = await this.provisioning.processProvisioning({
      orderId: updatedOrder.id,
      orderNumber: updatedOrder.order_number,
      telegramUserId: tgUserId,
      bundleId: updatedOrder.bundle_id,
      bundleSlug: updatedOrder.bundle.slug,
      bundleName: updatedOrder.bundle.name,
      durationDays: updatedOrder.bundle.duration_days,
      campaignId: updatedOrder.campaign_id || undefined,
      sessionId: updatedOrder.session_id || undefined,
    });

    // 6. Record Funnel Event
    await this.analytics.trackEvent(FunnelEventType.PAYMENT_SUCCESS, {
      telegramUserId: tgUserId,
      campaignId: updatedOrder.campaign_id || undefined,
      sessionId: updatedOrder.session_id || undefined,
      metadata: {
        orderNumber: updatedOrder.order_number,
        amountStars: payment.total_amount,
        chargeId: chargeId,
      },
    });

    return {
      order: updatedOrder,
      isDuplicate: false,
      provisioningLink: provisioningResult.activationLink,
      activationToken: provisioningResult.activationToken,
    };
  }

  private async answerPreCheckout(
    preCheckoutQueryId: string,
    ok: boolean,
    errorMessage?: string
  ): Promise<void> {
    const token = this.getBotToken();
    const url = `https://api.telegram.org/bot${token}/answerPreCheckoutQuery`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: preCheckoutQueryId,
          ok,
          error_message: errorMessage,
        }),
      });

      const data = (await response.json()) as any;
      if (!data.ok) {
        this.logger.error(`Telegram API answerPreCheckoutQuery failed: ${data.description}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to send answerPreCheckoutQuery: ${err.message}`, err.stack);
    }
  }
}
