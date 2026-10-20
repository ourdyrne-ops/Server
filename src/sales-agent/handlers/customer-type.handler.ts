import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CustomerType,
  FunnelEventType,
  InlineKeyboardMarkup,
  SalesConversationState,
  TelegramCallbackQuery,
} from '../interfaces/sales.interfaces.js';
import { getTranslation } from '../localization/translations.js';
import { ServiceBotBridgeService } from '../service-bridge/service-bot-bridge.service.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';

@Injectable()
export class CustomerTypeHandler {
  private readonly logger = new Logger(CustomerTypeHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceBridge: ServiceBotBridgeService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  async sendCustomerTypePrompt(
    chatId: string | number,
    session: any,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const lang = session.language || 'en';
    const t = getTranslation(lang);

    const text = `<b>${t.welcomeGreeting}</b>\n\n${t.selectCustomerType}`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [{ text: t.newCustomerBtn, callback_data: 'cust_new' }],
        [{ text: t.existingCustomerBtn, callback_data: 'cust_existing' }],
        [{ text: t.switchLanguageBtn, callback_data: 'nav_lang' }],
      ],
    };

    await this.prisma.salesSession.update({
      where: { id: session.id },
      data: {
        current_state: SalesConversationState.CUSTOMER_TYPE,
        last_active_at: new Date(),
      },
    });

    await sendMessageFn(chatId, text, keyboard);
  }

  async handleCustomerTypeSelection(
    callbackQuery: TelegramCallbackQuery,
    session: any,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>,
    onProceedToBundle: (session: any) => Promise<any>
  ) {
    const data = callbackQuery.data;
    const chatId = (callbackQuery.message?.chat.id || callbackQuery.from.id).toString();
    const lang = session.language || 'en';
    const t = getTranslation(lang);
    const tgUserId = session.telegram_user_id;

    if (data === 'cust_new') {
      this.logger.log(`User ${tgUserId} chose NEW_CUSTOMER`);

      const updatedSession = await this.prisma.salesSession.update({
        where: { id: session.id },
        data: {
          customer_type: CustomerType.NEW_CUSTOMER,
          current_state: SalesConversationState.BUNDLE_OVERVIEW,
          last_active_at: new Date(),
        },
        include: { bundle: true, campaign: true },
      });

      await this.analytics.trackEvent(FunnelEventType.CUSTOMER_TYPE_SELECTED, {
        sessionId: session.id,
        campaignId: session.campaign_id || undefined,
        telegramUserId: tgUserId,
        metadata: { customerType: CustomerType.NEW_CUSTOMER },
      });

      await onProceedToBundle(updatedSession);
    } else if (data === 'cust_existing') {
      this.logger.log(`User ${tgUserId} chose EXISTING_CUSTOMER`);

      await this.analytics.trackEvent(FunnelEventType.CUSTOMER_TYPE_SELECTED, {
        sessionId: session.id,
        campaignId: session.campaign_id || undefined,
        telegramUserId: tgUserId,
        metadata: { customerType: CustomerType.EXISTING_CUSTOMER },
      });

      // Verify existing student record
      const student = await this.serviceBridge.findStudentByTelegramId(tgUserId);
      const botUsername = this.serviceBridge.getServiceBotUsername();

      if (student && student.subscriptions && student.subscriptions.length > 0) {
        const sub = student.subscriptions[0];
        const subStatus = sub.status;
        const expiryDate = sub.current_period_end
          ? new Date(sub.current_period_end).toLocaleDateString()
          : 'N/A';

        const text = `${t.existingCustomerFound}\n\n📋 <b>Subscription Status:</b> ${subStatus}\n📅 <b>Valid Until:</b> ${expiryDate}\n\nChoose an option below:`;

        const keyboard: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: '🌟 Explore Course Bundles / Renewal', callback_data: 'cust_new' }],
            [{ text: '📚 Open Learning Bot (@' + botUsername + ')', url: `https://t.me/${botUsername}` }],
            [{ text: t.backBtn, callback_data: 'nav_cust_type' }],
          ],
        };

        await this.prisma.salesSession.update({
          where: { id: session.id },
          data: {
            customer_type: CustomerType.EXISTING_CUSTOMER,
            current_state: SalesConversationState.EXISTING_CUSTOMER_LINK,
            last_active_at: new Date(),
          },
        });

        await sendMessageFn(chatId, text, keyboard);
      } else {
        // Pending state without assuming identity
        const text = `${t.existingCustomerNotFound}\n\n⚠️ <i>Pending account verification: Authentication and student ID linking are maintained separately to ensure account security.</i>`;

        const keyboard: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: t.newCustomerBtn, callback_data: 'cust_new' }],
            [{ text: t.askSupportBtn, callback_data: 'faq_support' }],
            [{ text: t.backBtn, callback_data: 'nav_cust_type' }],
          ],
        };

        await this.prisma.salesSession.update({
          where: { id: session.id },
          data: {
            customer_type: CustomerType.EXISTING_CUSTOMER,
            current_state: SalesConversationState.EXISTING_CUSTOMER_LINK,
            last_active_at: new Date(),
          },
        });

        await sendMessageFn(chatId, text, keyboard);
      }
    }
  }
}
