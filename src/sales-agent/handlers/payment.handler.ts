import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  InlineKeyboardMarkup,
  SalesConversationState,
  TelegramMessage,
  TelegramPreCheckoutQuery,
  TelegramSuccessfulPayment,
} from '../interfaces/sales.interfaces.js';
import { getTranslation } from '../localization/translations.js';
import { StarsPaymentService } from '../payment/stars-payment.service.js';

@Injectable()
export class PaymentHandler {
  private readonly logger = new Logger(PaymentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly starsPayment: StarsPaymentService,
  ) {}

  async initiateCheckout(
    chatId: string | number,
    session: any,
    bundleId: string,
    sendInvoiceFn: (
      chatId: string | number,
      title: string,
      description: string,
      payload: string,
      currency: string,
      priceStars: number
    ) => Promise<any>,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const lang = session.language || 'en';
    const t = getTranslation(lang);

    this.logger.log(`Initiating checkout for user ${session.telegram_user_id}, bundle ${bundleId}`);

    // Create Order and generate invoice details
    const invoice = await this.starsPayment.createOrder({
      telegramUserId: session.telegram_user_id,
      bundleId,
      campaignId: session.campaign_id || undefined,
      sessionId: session.id,
    });

    await this.prisma.salesSession.update({
      where: { id: session.id },
      data: {
        current_state: SalesConversationState.CHECKOUT_PENDING,
        last_active_at: new Date(),
      },
    });

    // Send Telegram Stars invoice
    await sendInvoiceFn(
      chatId,
      invoice.title,
      invoice.description,
      invoice.payload,
      invoice.currency,
      invoice.priceStars
    );

    const helperText = `📋 <b>${t.orderCreated.replace('{orderNumber}', invoice.orderNumber)}</b>\n\n` +
      `⭐ <b>Amount:</b> ${invoice.priceStars} Telegram Stars (XTR)\n` +
      `<i>Tap "Pay ${invoice.priceStars} ⭐️" on the invoice card above to proceed securely inside Telegram.</i>`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: t.backBtn, callback_data: 'nav_bundle_current' }],
        [{ text: t.askSupportBtn, callback_data: 'faq_support' }],
      ],
    };

    await sendMessageFn(chatId, helperText, keyboard);
  }

  async processPreCheckoutQuery(query: TelegramPreCheckoutQuery) {
    return this.starsPayment.handlePreCheckoutQuery(query);
  }

  async processSuccessfulPayment(
    payment: TelegramSuccessfulPayment,
    message: TelegramMessage,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const chatId = message.chat.id;
    const tgUserId = message.from ? BigInt(message.from.id) : BigInt(0);

    const session = await this.prisma.salesSession.findFirst({
      where: { telegram_user_id: tgUserId },
      orderBy: { created_at: 'desc' },
    });

    const lang = session?.language || 'en';
    const t = getTranslation(lang);

    const result = await this.starsPayment.handleSuccessfulPayment(payment, message);
    const order = result.order;
    const activationLink = result.provisioningLink || `https://t.me/melcome_university_bot`;

    if (session) {
      await this.prisma.salesSession.update({
        where: { id: session.id },
        data: {
          current_state: SalesConversationState.ACTIVATION_PENDING,
          last_active_at: new Date(),
        },
      });
    }

    const successTitle = t.paymentSuccessTitle;
    const successBody = t.paymentSuccessBody
      .replace('{orderNumber}', order.order_number)
      .replace('{amount}', order.amount_stars.toString());

    const text = `<b>${successTitle}</b>\n\n` +
      `${successBody}\n\n` +
      `📦 <b>Bundle:</b> ${order.bundle.name}\n` +
      `⭐ <b>Paid:</b> ${order.amount_stars} Stars\n` +
      `🔑 <b>Charge ID:</b> <code>${order.telegram_payment_charge_id || 'N/A'}</code>\n\n` +
      `👉 <b>${t.activationInstructions}</b>\n\n` +
      `<i>Note: Access is provisioned via our official University Content Bot. Click below to begin:</i>`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: t.activateNowBtn,
            url: activationLink,
          },
        ],
        [
          { text: t.askSupportBtn, callback_data: 'faq_support' },
        ],
      ],
    };

    await sendMessageFn(chatId, text, keyboard);
  }
}
