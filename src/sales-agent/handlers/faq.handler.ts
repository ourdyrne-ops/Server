import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FunnelEventType,
  InlineKeyboardMarkup,
  SalesConversationState,
  TelegramCallbackQuery,
} from '../interfaces/sales.interfaces.js';
import { getTranslation } from '../localization/translations.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';

@Injectable()
export class FaqHandler {
  private readonly logger = new Logger(FaqHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  async renderFaqMenu(
    chatId: string | number,
    session: any,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const lang = session.language || 'en';
    const t = getTranslation(lang);
    const bundleId = session.bundle_id;

    const text = `<b>${t.faqTitle}</b>\n\n${t.faqPrompt}`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: t.faqQuestions.content.q, callback_data: 'faq_content' }],
        [{ text: t.faqQuestions.access.q, callback_data: 'faq_access' }],
        [{ text: t.faqQuestions.payment.q, callback_data: 'faq_payment' }],
        [{ text: t.faqQuestions.expiry.q, callback_data: 'faq_expiry' }],
        [{ text: t.faqQuestions.refund.q, callback_data: 'faq_refund' }],
        [{ text: t.faqQuestions.support.q, callback_data: 'faq_support' }],
        [
          { text: t.buyNowBtn, callback_data: `buy_${bundleId || ''}` },
          { text: t.backBtn, callback_data: 'nav_bundle_current' },
        ],
      ],
    };

    await this.prisma.salesSession.update({
      where: { id: session.id },
      data: {
        current_state: SalesConversationState.FAQ_MENU,
        last_active_at: new Date(),
      },
    });

    await this.analytics.trackEvent(FunnelEventType.FAQ_VIEWED, {
      sessionId: session.id,
      campaignId: session.campaign_id || undefined,
      telegramUserId: session.telegram_user_id,
      metadata: { action: 'view_menu' },
    });

    await sendMessageFn(chatId, text, keyboard);
  }

  async handleFaqAnswer(
    callbackQuery: TelegramCallbackQuery,
    session: any,
    topic: 'content' | 'access' | 'payment' | 'expiry' | 'refund' | 'support',
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const chatId = (callbackQuery.message?.chat.id || callbackQuery.from.id).toString();
    const lang = session.language || 'en';
    const t = getTranslation(lang);
    const bundleId = session.bundle_id;

    const qItem = t.faqQuestions[topic];
    if (!qItem) {
      await sendMessageFn(chatId, t.supportContactMsg);
      return;
    }

    const text = `<b>${qItem.q}</b>\n\n${qItem.a}`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: t.buyNowBtn, callback_data: `buy_${bundleId || ''}` },
          { text: '❓ More Questions', callback_data: 'nav_faq' },
        ],
        [
          { text: t.askSupportBtn, callback_data: 'faq_support' },
          { text: t.backBtn, callback_data: 'nav_bundle_current' },
        ],
      ],
    };

    await this.prisma.salesSession.update({
      where: { id: session.id },
      data: {
        current_state: SalesConversationState.FAQ_ANSWER,
        last_active_at: new Date(),
      },
    });

    await this.analytics.trackEvent(FunnelEventType.FAQ_VIEWED, {
      sessionId: session.id,
      campaignId: session.campaign_id || undefined,
      telegramUserId: session.telegram_user_id,
      metadata: { topic },
    });

    await sendMessageFn(chatId, text, keyboard);
  }

  async handleSupportContact(
    chatId: string | number,
    session: any,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const lang = session.language || 'en';
    const t = getTranslation(lang);

    const text = `👨‍💻 <b>Human Support Desk</b>\n\n${t.supportContactMsg}\n\nOur team is available 7 days a week to answer questions regarding syllabus, custom bundles, or team subscriptions.`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: '💬 Chat with Support Admin (@melcome_admin)', url: 'https://t.me/melcome_admin' }],
        [{ text: t.backBtn, callback_data: 'nav_faq' }],
      ],
    };

    await sendMessageFn(chatId, text, keyboard);
  }
}
