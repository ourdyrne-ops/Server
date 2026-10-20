import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  InlineKeyboardMarkup,
  SalesConversationState,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramPreCheckoutQuery,
  TelegramUpdate,
} from './interfaces/sales.interfaces.js';
import { TriggerHandler } from './handlers/trigger.handler.js';
import { LanguageHandler } from './handlers/language.handler.js';
import { CustomerTypeHandler } from './handlers/customer-type.handler.js';
import { BundleDemoHandler } from './handlers/bundle-demo.handler.js';
import { FaqHandler } from './handlers/faq.handler.js';
import { PaymentHandler } from './handlers/payment.handler.js';

@Injectable()
export class SalesAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalesAgentService.name);
  private isPolling = false;
  private pollingOffset = 0;
  private botInfo: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggerHandler: TriggerHandler,
    private readonly languageHandler: LanguageHandler,
    private readonly customerTypeHandler: CustomerTypeHandler,
    private readonly bundleDemoHandler: BundleDemoHandler,
    private readonly faqHandler: FaqHandler,
    private readonly paymentHandler: PaymentHandler,
  ) {}

  getBotToken(): string {
    return (
      process.env.SALES_BOT_TOKEN ||
      '8891888818:AAFQ4Q_HFXSO6QC4KbuRJ39z-vi8JC6-gOk'
    );
  }

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.initBotInfo().then(() => {
        this.startPolling().catch((err) =>
          this.logger.error(`Failed to start Sales Bot polling: ${err.message}`)
        );
      });
    }
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  private async initBotInfo() {
    const token = this.getBotToken();
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = (await res.json()) as any;
      if (data.ok) {
        this.botInfo = data.result;
        this.logger.log(`Sales Bot initialized: @${this.botInfo.username} (${this.botInfo.first_name})`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch Sales Bot getMe: ${err.message}`);
    }
  }

  async startPolling() {
    const token = this.getBotToken();
    if (!token) {
      this.logger.warn('SALES_BOT_TOKEN not configured. Polling not started.');
      return;
    }

    try {
      const webhookRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const webhookData = (await webhookRes.json()) as any;
      if (webhookData?.result?.url) {
        this.logger.log(
          `Sales Bot active webhook found (${webhookData.result.url}). Skipping long polling.`
        );
        return;
      }
    } catch {
      // ignore
    }

    this.isPolling = true;
    this.logger.log('Started Telegram Sales Agent long polling loop...');

    while (this.isPolling) {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.pollingOffset}&timeout=25`;
        const res = await fetch(url);
        const data = (await res.json()) as any;

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.pollingOffset = update.update_id + 1;
            await this.processUpdate(update).catch((err) =>
              this.logger.error(`Error processing update ${update.update_id}: ${err.message}`, err.stack)
            );
          }
        } else if (!data.ok) {
          this.logger.error(`Sales Bot getUpdates error: ${data.description}`);
          await new Promise((r) => setTimeout(r, 4000));
        }
      } catch (err: any) {
        if (!this.isPolling) break;
        this.logger.error(`Sales Bot polling network error: ${err.message}`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }

  stopPolling() {
    this.isPolling = false;
    this.logger.log('Stopped Sales Agent polling.');
  }

  async processUpdate(update: TelegramUpdate) {
    // 1. Pre-Checkout Queries (Telegram Stars)
    if (update.pre_checkout_query) {
      await this.handlePreCheckoutQuery(update.pre_checkout_query);
      return;
    }

    // 2. Callback Queries (Inline button clicks)
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    // 3. Messages
    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }
  }

  private async handleMessage(message: TelegramMessage) {
    // Check for marketing group trigger
    if (this.triggerHandler.isGroupTrigger(message)) {
      await this.triggerHandler.handleGroupTrigger(message, this.sendMessage.bind(this));
      return;
    }

    // Only process private chats for direct conversation flow
    if (message.chat.type !== 'private') return;

    const fromUser = message.from;
    if (!fromUser) return;
    const tgUserId = BigInt(fromUser.id);
    const text = (message.text || '').trim();

    // Check for successful payment update
    if (message.successful_payment) {
      await this.paymentHandler.processSuccessfulPayment(
        message.successful_payment,
        message,
        this.sendMessage.bind(this)
      );
      return;
    }

    // Check for /start command
    if (text.startsWith('/start')) {
      const { campaignCode, bundleSlug } = this.triggerHandler.parseStartPayload(text);

      let campaign = null;
      if (campaignCode) {
        campaign = await this.prisma.salesCampaign.findUnique({
          where: { code: campaignCode },
          include: { bundle: true },
        });
      }

      let bundle = null;
      if (bundleSlug) {
        bundle = await this.prisma.courseBundle.findUnique({
          where: { slug: bundleSlug },
        });
      } else if (campaign?.bundle) {
        bundle = campaign.bundle;
      }

      // Upsert SalesSession
      const session = await this.prisma.salesSession.upsert({
        where: { id: `session_${tgUserId}` },
        update: {
          chat_id: message.chat.id.toString(),
          campaign_id: campaign?.id || undefined,
          bundle_id: bundle?.id || undefined,
          current_state: SalesConversationState.LANGUAGE_SELECTION,
          last_active_at: new Date(),
        },
        create: {
          id: `session_${tgUserId}`,
          telegram_user_id: tgUserId,
          chat_id: message.chat.id.toString(),
          campaign_id: campaign?.id || undefined,
          bundle_id: bundle?.id || undefined,
          language: fromUser.language_code || 'en',
          current_state: SalesConversationState.LANGUAGE_SELECTION,
        },
        include: { bundle: true, campaign: true },
      });

      // Show language selection first
      await this.languageHandler.sendLanguagePrompt(
        message.chat.id,
        session,
        this.sendMessage.bind(this)
      );
      return;
    }

    // Get active session
    let session = await this.prisma.salesSession.findFirst({
      where: { telegram_user_id: tgUserId },
      include: { bundle: true, campaign: true },
    });

    if (!session) {
      session = await this.prisma.salesSession.create({
        data: {
          id: `session_${tgUserId}`,
          telegram_user_id: tgUserId,
          chat_id: message.chat.id.toString(),
          language: fromUser.language_code || 'en',
          current_state: SalesConversationState.LANGUAGE_SELECTION,
        },
        include: { bundle: true, campaign: true },
      });
      await this.languageHandler.sendLanguagePrompt(
        message.chat.id,
        session,
        this.sendMessage.bind(this)
      );
      return;
    }

    // Normal command handlers
    if (text === '/lang' || text === '/language') {
      await this.languageHandler.sendLanguagePrompt(
        message.chat.id,
        session,
        this.sendMessage.bind(this)
      );
      return;
    }

    if (text === '/bundles' || text === '/courses') {
      await this.bundleDemoHandler.renderBundleDemo(
        message.chat.id,
        session,
        undefined,
        this.sendMessage.bind(this)
      );
      return;
    }

    if (text === '/faq' || text === '/help') {
      await this.faqHandler.renderFaqMenu(message.chat.id, session, this.sendMessage.bind(this));
      return;
    }

    // Default response: guide user back to current state
    await this.bundleDemoHandler.renderBundleDemo(
      message.chat.id,
      session,
      undefined,
      this.sendMessage.bind(this)
    );
  }

  private async handleCallbackQuery(callbackQuery: TelegramCallbackQuery) {
    const data = callbackQuery.data || '';
    const fromUser = callbackQuery.from;
    const tgUserId = BigInt(fromUser.id);
    const chatId = (callbackQuery.message?.chat.id || fromUser.id).toString();

    await this.answerCallbackQuery(callbackQuery.id);

    let session = await this.prisma.salesSession.findFirst({
      where: { telegram_user_id: tgUserId },
      include: { bundle: true, campaign: true },
    });

    if (!session) {
      session = await this.prisma.salesSession.create({
        data: {
          id: `session_${tgUserId}`,
          telegram_user_id: tgUserId,
          chat_id: chatId.toString(),
          language: fromUser.language_code || 'en',
          current_state: SalesConversationState.LANGUAGE_SELECTION,
        },
        include: { bundle: true, campaign: true },
      });
    }

    // 1. Language Selected (lang_hi, lang_bn, etc.)
    if (data.startsWith('lang_')) {
      await this.languageHandler.processLanguageCallback(
        callbackQuery,
        session,
        async (_newLang, updatedSession) => {
          await this.customerTypeHandler.sendCustomerTypePrompt(
            chatId,
            updatedSession,
            this.sendMessage.bind(this)
          );
        }
      );
      return;
    }

    // 2. Customer Type Selected (cust_new, cust_existing)
    if (data === 'cust_new' || data === 'cust_existing') {
      await this.customerTypeHandler.handleCustomerTypeSelection(
        callbackQuery,
        session,
        this.sendMessage.bind(this),
        async (updatedSession) => {
          await this.bundleDemoHandler.renderBundleDemo(
            chatId,
            updatedSession,
            undefined,
            this.sendMessage.bind(this)
          );
        }
      );
      return;
    }

    // 3. Purchase / Buy Initiated (buy_<bundleId>)
    if (data.startsWith('buy_')) {
      const bundleId = data.replace('buy_', '') || session.bundle_id;
      if (bundleId) {
        await this.paymentHandler.initiateCheckout(
          chatId,
          session,
          bundleId,
          this.sendInvoice.bind(this),
          this.sendMessage.bind(this)
        );
      }
      return;
    }

    // 4. FAQ Navigation
    if (data === 'nav_faq') {
      await this.faqHandler.renderFaqMenu(chatId, session, this.sendMessage.bind(this));
      return;
    }

    if (data.startsWith('faq_')) {
      const topic = data.replace('faq_', '') as any;
      if (topic === 'support') {
        await this.faqHandler.handleSupportContact(chatId, session, this.sendMessage.bind(this));
      } else {
        await this.faqHandler.handleFaqAnswer(
          callbackQuery,
          session,
          topic,
          this.sendMessage.bind(this)
        );
      }
      return;
    }

    // 5. Bundle Navigation
    if (data === 'nav_bundles') {
      await this.bundleDemoHandler.renderBundlesList(chatId, session, this.sendMessage.bind(this));
      return;
    }

    if (data.startsWith('view_bnd_')) {
      const bndId = data.replace('view_bnd_', '');
      await this.bundleDemoHandler.renderBundleDemo(
        chatId,
        session,
        bndId,
        this.sendMessage.bind(this)
      );
      return;
    }

    if (data === 'nav_bundle_current') {
      await this.bundleDemoHandler.renderBundleDemo(
        chatId,
        session,
        undefined,
        this.sendMessage.bind(this)
      );
      return;
    }

    // 6. Navigation Back
    if (data === 'nav_lang') {
      await this.languageHandler.sendLanguagePrompt(chatId, session, this.sendMessage.bind(this));
      return;
    }

    if (data === 'nav_cust_type') {
      await this.customerTypeHandler.sendCustomerTypePrompt(
        chatId,
        session,
        this.sendMessage.bind(this)
      );
      return;
    }

    if (data === 'sales_renew_prompt') {
      await this.bundleDemoHandler.renderBundleDemo(
        chatId,
        session,
        undefined,
        this.sendMessage.bind(this)
      );
      return;
    }
  }

  private async handlePreCheckoutQuery(query: TelegramPreCheckoutQuery) {
    await this.paymentHandler.processPreCheckoutQuery(query);
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    keyboard?: InlineKeyboardMarkup
  ): Promise<any> {
    const token = this.getBotToken();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }),
    });

    const data = (await res.json()) as any;
    if (!data.ok) {
      this.logger.error(`Sales Bot sendMessage failed to ${chatId}: ${data.description}`);
    }
    return data;
  }

  async sendInvoice(
    chatId: string | number,
    title: string,
    description: string,
    payload: string,
    currency: string,
    priceStars: number
  ): Promise<any> {
    const token = this.getBotToken();
    const url = `https://api.telegram.org/bot${token}/sendInvoice`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        title,
        description,
        payload,
        provider_token: '', // Mandatory empty string for Telegram Stars (XTR)
        currency: 'XTR',
        prices: [{ label: title, amount: priceStars }],
        start_parameter: `pay_${payload.slice(0, 20)}`,
      }),
    });

    const data = (await res.json()) as any;
    if (!data.ok) {
      this.logger.error(`Sales Bot sendInvoice failed: ${data.description}`);
      throw new Error(`Failed to send Telegram Stars invoice: ${data.description}`);
    }
    return data;
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<any> {
    const token = this.getBotToken();
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
        }),
      });
    } catch {
      // ignore
    }
  }
}
