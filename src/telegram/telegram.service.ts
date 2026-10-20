import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { RouterService } from './navigation/router.service.js';
import { ServiceBotBridgeService } from '../sales-agent/service-bridge/service-bot-bridge.service.js';
import * as crypto from 'crypto';

export interface AutoDeleteConfig {
  enabled: boolean;
  inactivityMinutes: number; // e.g. 60 (1 hour) or 120 (2 hours)
}

export interface TrackedBotMessage {
  messageId: number;
  chatId: string;
  sentAt: number;
}

export interface NavigationState {
  module?: 'main' | 'latest' | 'courses' | 'categories' | 'account' | 'help';
  format?: 'VIDEO' | 'AUDIO' | 'TEXT';
  categoryId?: string;
  categoryName?: string;
  step?: 'module' | 'format' | 'category' | 'items';
}

export interface StudentSession {
  studentId: string;
  telegramUserId: bigint;
  chatId: string;
  lastActiveAt: number;
  messages: TrackedBotMessage[];
  navState?: NavigationState;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private isPolling = false;
  private pollingOffset = 0;

  // Auto-Delete & Inactivity Protection State
  private autoDeleteConfig: AutoDeleteConfig = {
    enabled: true,
    inactivityMinutes: 60, // Default: 1 hour idle inactivity
  };
  private studentSessions = new Map<string, StudentSession>();
  private totalAutoDeleted = 0;
  private cleanerTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly routerService: RouterService,
    private readonly serviceBridge: ServiceBotBridgeService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      this.setBotCommands().catch((err) =>
        this.logger.warn(`Failed to set Telegram bot commands: ${err.message}`),
      );
      this.startPolling().catch((err) =>
        this.logger.error(`Failed to start Telegram polling: ${err.message}`),
      );
      this.startCleaner();
    }
  }

  onModuleDestroy() {
    this.stopPolling();
    this.stopCleaner();
  }

  // --- LONG POLLING ENGINE ---

  async startPolling() {
    const token = this.getBotToken();
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured. Polling not started.');
      return;
    }

    try {
      const webhookRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
      const webhookData = (await webhookRes.json()) as any;
      if (webhookData?.result?.url) {
        this.logger.log(`Active webhook found (${webhookData.result.url}). Skipping long polling.`);
        return;
      }
    } catch {
      // ignore
    }

    // Ensure webhook is cleared so getUpdates works
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).catch(() => {});

    this.isPolling = true;
    this.logger.log('🚀 Starting Telegram Bot long-polling loop for real-time interaction...');
    this.runPollingLoop();
  }

  stopPolling() {
    this.isPolling = false;
  }

  private async runPollingLoop() {
    const token = this.getBotToken();
    while (this.isPolling) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${this.pollingOffset}&timeout=10`,
        );
        const data = (await res.json()) as any;

        if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
          const maxUpdateId = Math.max(...data.result.map((u: any) => u.update_id));
          this.pollingOffset = maxUpdateId + 1;

          // Process all updates in batch concurrently for instant response time
          await Promise.allSettled(
            data.result.map(async (update: any) => {
              try {
                await this.handleUpdate(update);
              } catch (err: any) {
                this.logger.error(`Error processing update ${update.update_id}: ${err.message}`);
              }
            }),
          );
        } else if (!data.ok) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err: any) {
        if (this.isPolling) {
          this.logger.warn(`Telegram polling error: ${err.message}`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  // --- AUTO-DELETE & INACTIVITY SESSION GUARD ---

  startCleaner() {
    if (this.cleanerTimer) return;
    this.cleanerTimer = setInterval(() => {
      this.checkAndCleanIdleSessions().catch((err) =>
        this.logger.error(`Error in auto-delete cleaner: ${err.message}`),
      );
    }, 30 * 1000); // Scan every 30 seconds
    this.logger.log(`🛡️ Auto-Delete Cleaner active (inactivity threshold: ${this.autoDeleteConfig.inactivityMinutes} mins)`);
  }

  stopCleaner() {
    if (this.cleanerTimer) {
      clearInterval(this.cleanerTimer);
      this.cleanerTimer = null;
    }
  }

  touchSession(studentId: string, telegramUserId: bigint, chatId: string): StudentSession {
    const now = Date.now();
    let session = this.studentSessions.get(studentId);

    if (!session) {
      session = {
        studentId,
        telegramUserId,
        chatId,
        lastActiveAt: now,
        messages: [],
      };
      this.studentSessions.set(studentId, session);
    } else {
      // Check if student was idle past threshold before this new interaction
      const idleMs = now - session.lastActiveAt;
      const thresholdMs = this.autoDeleteConfig.inactivityMinutes * 60 * 1000;

      if (this.autoDeleteConfig.enabled && idleMs >= thresholdMs && session.messages.length > 0) {
        this.cleanSessionMessages(session, 'idle_return').catch(() => {});
      }

      // Continuous learning extension: reset inactivity timer on every interaction!
      session.lastActiveAt = now;
      session.chatId = chatId;
    }

    return session;
  }

  trackSentMessage(chatId: string, messageId: number, studentId?: string) {
    let session = studentId ? this.studentSessions.get(studentId) : undefined;
    if (!session) {
      for (const s of this.studentSessions.values()) {
        if (s.chatId === chatId) {
          session = s;
          break;
        }
      }
    }

    if (session) {
      session.messages.push({
        chatId,
        messageId,
        sentAt: Date.now(),
      });
    }
  }

  async deleteMessage(chatId: string | number | bigint, messageId: number) {
    const token = this.getBotToken();
    if (!token) return { ok: false, error: 'NO_BOT_TOKEN' };

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId.toString(),
          message_id: messageId,
        }),
      });
      return await response.json();
    } catch (err: any) {
      this.logger.warn(`Failed to delete message ${messageId} in ${chatId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async checkAndCleanIdleSessions() {
    if (!this.autoDeleteConfig.enabled) return 0;

    const now = Date.now();
    const thresholdMs = this.autoDeleteConfig.inactivityMinutes * 60 * 1000;
    let cleanedCount = 0;

    for (const [, session] of this.studentSessions.entries()) {
      const idleMs = now - session.lastActiveAt;
      if (idleMs >= thresholdMs && session.messages.length > 0) {
        cleanedCount += session.messages.length;
        await this.cleanSessionMessages(session, `idle_${Math.round(idleMs / 60000)}m`);
      }
    }

    return cleanedCount;
  }

  async cleanSessionMessages(session: StudentSession, reason: string) {
    const msgsToDelete = [...session.messages];
    if (msgsToDelete.length === 0) return;

    this.logger.log(`🧹 Auto-Deleting ${msgsToDelete.length} messages for student ${session.studentId} (${reason})`);
    session.messages = []; // Clear immediately to prevent re-entry

    const batchSize = 10;
    for (let i = 0; i < msgsToDelete.length; i += batchSize) {
      const batch = msgsToDelete.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((m) => this.deleteMessage(m.chatId, m.messageId)));
      this.totalAutoDeleted += batch.length;
    }
  }

  async clearChatCompletely(session: StudentSession, telegramUserId: bigint, incomingMessageId?: number) {
    const chatIdStr = telegramUserId.toString();
    const idSet = new Set<number>();

    // 1. Collect all messages tracked in session
    for (const m of session.messages) {
      idSet.add(m.messageId);
    }

    // 2. Include user trigger message and recent message IDs
    if (incomingMessageId) {
      idSet.add(incomingMessageId);
      const sweepLimit = Math.max(1, incomingMessageId - 25);
      for (let i = sweepLimit; i <= incomingMessageId; i++) {
        idSet.add(i);
      }
    }

    this.logger.log(`🧹 Complete chat wipe requested by student ${session.studentId}. Deleting ${idSet.size} potential messages...`);
    session.messages = [];
    session.navState = { module: 'main' };

    const sortedIds = Array.from(idSet).sort((a, b) => b - a);
    const batchSize = 10;
    for (let i = 0; i < sortedIds.length; i += batchSize) {
      const batch = sortedIds.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((msgId) => this.deleteMessage(chatIdStr, msgId)));
      this.totalAutoDeleted += batch.length;
    }

    // Ensure session messages list is completely empty
    session.messages = [];
    this.logger.log(`✓ Chat completely cleared for student ${session.studentId}. Screen is empty.`);
  }

  async cleanIdleSessionsNow() {
    return this.checkAndCleanIdleSessions();
  }

  getAutoDeleteConfig() {
    return {
      ...this.autoDeleteConfig,
      totalAutoDeleted: this.totalAutoDeleted,
      activeSessionsCount: this.studentSessions.size,
      activeSessions: Array.from(this.studentSessions.values()).map((s) => ({
        studentId: s.studentId,
        telegramUserId: s.telegramUserId.toString(),
        chatId: s.chatId,
        idleMinutes: Math.round((Date.now() - s.lastActiveAt) / 60000),
        messagesCount: s.messages.length,
      })),
    };
  }

  updateAutoDeleteConfig(config: Partial<AutoDeleteConfig>) {
    if (typeof config.enabled === 'boolean') {
      this.autoDeleteConfig.enabled = config.enabled;
    }
    if (typeof config.inactivityMinutes === 'number' && config.inactivityMinutes > 0) {
      this.autoDeleteConfig.inactivityMinutes = config.inactivityMinutes;
    }
    this.logger.log(
      `Updated Auto-Delete Config: enabled=${this.autoDeleteConfig.enabled}, inactivityMinutes=${this.autoDeleteConfig.inactivityMinutes}`,
    );
    return this.getAutoDeleteConfig();
  }

  // --- WEBHOOK SECURITY & UPDATE HANDLING ---

  verifyWebhookSecret(secretToken: string | undefined): boolean {
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!configuredSecret || !secretToken) return false;
    
    // Constant-time comparison
    if (secretToken.length !== configuredSecret.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(secretToken),
      Buffer.from(configuredSecret)
    );
  }

  async handleUpdate(update: any) {
    // 1. Handle pre_checkout_query for Telegram Stars payment approval
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const res = await this.paymentsService.answerPreCheckoutQuery(query);
      this.logger.log(`⭐ pre_checkout_query ${query.id} handled for user ${query.from?.id}: ok=${res.ok}`);
      return { status: 'processed', type: 'pre_checkout_query', id: query.id, ok: res.ok };
    }

    // Extract user from message or callback_query
    const from = update.message?.from || update.callback_query?.from;

    if (!from || !from.id) {
      return { status: 'ignored', reason: 'no_user_id' };
    }

    const telegramUserId = BigInt(from.id);
    const username = from.username || null;
    const firstName = from.first_name || null;
    const lastName = from.last_name || null;

    // Upsert student record
    const student = await this.prisma.student.upsert({
      where: { telegram_user_id: telegramUserId },
      update: {
        username,
        first_name: firstName,
        last_name: lastName,
      },
      create: {
        telegram_user_id: telegramUserId,
        username,
        first_name: firstName,
        last_name: lastName,
      },
    });

    // Touch and refresh active session (Inactivity guard)
    const chatId = (
      update.message?.chat?.id ||
      update.callback_query?.message?.chat?.id ||
      from.id
    ).toString();
    this.touchSession(student.id, telegramUserId, chatId);

    // 2. Handle successful_payment for Telegram Stars
    if (update.message?.successful_payment) {
      const sp = update.message.successful_payment;
      const result = await this.paymentsService.handleSuccessfulPayment({
        studentId: student.id,
        telegramUserId,
        successfulPayment: sp,
      });

      const validUntilStr = result.validUntil
        ? new Date(result.validUntil).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : '30 days';

      const successMessage =
        `🎉 <b>Payment Successful!</b>\n\n` +
        `⭐ Received <b>${sp.total_amount} Telegram Stars</b>.\n\n` +
        `✅ Your <b>Melcome University All-Access</b> subscription is active until <b>${validUntilStr}</b>!\n\n` +
        `You have complete access to all Video courses, Audio lessons, and Notes. Choose an option below to start:`;

      const menuResponse = await this.routerService.handleRoute('/start', student.id);
      await this.sendMessage(
        telegramUserId,
        successMessage,
        'HTML',
        menuResponse.replyMarkup,
        student.id,
      );
      return { status: 'processed', type: 'successful_payment', student_id: student.id };
    }

    // Extract text or callback data
    const messageText = update.message?.text;
    const callbackData = update.callback_query?.data;
    const callbackId = update.callback_query?.id;

    if (callbackId) {
      await this.answerCallbackQuery(callbackId).catch(() => {});
    }

    if (messageText) {
      await this.handleMenuCommand(student, messageText, update.message?.message_id);
    } else if (callbackData) {
      await this.handleCallbackQuery(student, callbackData);
    }

    this.logger.log(`Handled update for student ${student.id} (${student.username || student.telegram_user_id})`);

    return { status: 'processed', student_id: student.id };
  }

  // --- AUTHORIZATION & SUBSCRIPTION CHECK ---

  async getActiveSubscription(studentId: string, studentRecord?: any) {
    if (studentRecord && studentRecord.is_active === false) {
      return null;
    }

    try {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { is_active: true },
      });
      if (student && student.is_active === false) {
        return null;
      }
    } catch {}

    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: {
        student_id: studentId,
        status: 'ACTIVE',
        OR: [
          { current_period_end: { gt: now } },
          { current_period_end: null },
        ],
      },
      include: { plan: true },
      orderBy: { created_at: 'desc' },
    });

    return sub;
  }

  // --- TELEGRAM CONNECT & BOT API HELPERS ---

  getBotToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN || '';
  }

  async getBotStatus() {
    const token = this.getBotToken();
    if (!token) {
      return {
        connected: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured in .env',
      };
    }

    try {
      const [meRes, webhookRes] = await Promise.all([
        fetch(`https://api.telegram.org/bot${token}/getMe`),
        fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`),
      ]);

      const meData = await meRes.json() as any;
      const webhookData = await webhookRes.json() as any;

      if (!meData.ok) {
        return {
          connected: false,
          error: meData.description || 'Failed to authenticate with Telegram',
        };
      }

      return {
        connected: true,
        bot: meData.result,
        webhook: webhookData.result,
        webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
        autoDelete: this.getAutoDeleteConfig(),
      };
    } catch (err: any) {
      return {
        connected: false,
        error: err.message || 'Error communicating with Telegram Bot API',
      };
    }
  }

  async setWebhook(url: string, secretToken?: string) {
    const token = this.getBotToken();
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured in .env');
    }

    this.stopPolling();

    const secret = secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;
    const body: Record<string, any> = { url };
    if (secret) {
      body.secret_token = secret;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return response.json();
  }

  async deleteWebhook() {
    const token = this.getBotToken();
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured in .env');
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
    });

    // Resume long-polling when webhook is deleted
    this.startPolling().catch(() => {});

    return response.json();
  }

  async sendMessage(
    chatId: string | number | bigint,
    text: string,
    parseMode: string = 'HTML',
    replyMarkup?: any,
    studentId?: string,
  ) {
    const token = this.getBotToken();
    if (!token) {
      this.logger.warn(`TELEGRAM_BOT_TOKEN not configured. Message to ${chatId} suppressed.`);
      return { ok: false, error: 'NO_BOT_TOKEN' };
    }

    const payload: Record<string, any> = {
      chat_id: chatId.toString(),
      text,
      parse_mode: parseMode,
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    // Track message for Auto-Delete
    if (result.ok && result.result?.message_id) {
      this.trackSentMessage(chatId.toString(), result.result.message_id, studentId);
    }

    return result;
  }

  async sendVideo(
    chatId: string | number | bigint,
    videoUrl: string,
    caption?: string,
    replyMarkup?: any,
    studentId?: string,
  ) {
    const token = this.getBotToken();
    if (!token) {
      return this.sendMessage(chatId, caption || '', 'HTML', replyMarkup, studentId);
    }

    try {
      const safeCaption = caption && caption.length > 1024 ? caption.slice(0, 1020) + '...' : caption;
      const payload: Record<string, any> = {
        chat_id: chatId.toString(),
        video: videoUrl,
        caption: safeCaption,
        parse_mode: 'HTML',
      };
      if (replyMarkup) payload.reply_markup = replyMarkup;

      const response = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.ok && result.result?.message_id) {
        this.trackSentMessage(chatId.toString(), result.result.message_id, studentId);
        return result;
      }
      this.logger.warn(`sendVideo failed (${JSON.stringify(result)}). Falling back to sendMessage with video link.`);
    } catch (err: any) {
      this.logger.warn(`sendVideo error: ${err.message}. Falling back to sendMessage.`);
    }

    // Seamless fallback to HTML message with direct streaming link
    return this.sendMessage(chatId, caption || '', 'HTML', replyMarkup, studentId);
  }

  async sendAudio(
    chatId: string | number | bigint,
    audioUrl: string,
    caption?: string,
    title?: string,
    replyMarkup?: any,
    studentId?: string,
  ) {
    const token = this.getBotToken();
    if (!token) {
      return this.sendMessage(chatId, caption || '', 'HTML', replyMarkup, studentId);
    }

    try {
      const safeCaption = caption && caption.length > 1024 ? caption.slice(0, 1020) + '...' : caption;
      const payload: Record<string, any> = {
        chat_id: chatId.toString(),
        audio: audioUrl,
        caption: safeCaption,
        title: title || 'Audio Lesson',
        performer: 'Melcome University',
        parse_mode: 'HTML',
      };
      if (replyMarkup) payload.reply_markup = replyMarkup;

      const response = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.ok && result.result?.message_id) {
        this.trackSentMessage(chatId.toString(), result.result.message_id, studentId);
        return result;
      }
      this.logger.warn(`sendAudio failed (${JSON.stringify(result)}). Falling back to sendMessage.`);
    } catch (err: any) {
      this.logger.warn(`sendAudio error: ${err.message}. Falling back to sendMessage.`);
    }

    // Seamless fallback to HTML message with direct streaming link
    return this.sendMessage(chatId, caption || '', 'HTML', replyMarkup, studentId);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    const token = this.getBotToken();
    if (!token) return;

    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    }).catch(() => {});
  }

  async createInviteLink(chatId: string | number, name?: string, expireDate?: number, memberLimit?: number) {
    const token = this.getBotToken();
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured in .env');
    }

    const payload: any = {
      chat_id: chatId,
    };
    if (name) payload.name = name;
    if (expireDate) payload.expire_date = expireDate;
    if (memberLimit) payload.member_limit = memberLimit;

    const response = await fetch(`https://api.telegram.org/bot${token}/createChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.json();
  }

  async getStudents() {
    const students = await this.prisma.student.findMany({
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { current_period_end: 'desc' },
        },
        payments: {
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Convert BigInt to string for JSON serialization
    return students.map((s) => ({
      ...s,
      telegram_user_id: s.telegram_user_id.toString(),
    }));
  }

  // --- BOT MENU & INTERACTIVE WORKFLOWS ---

  private async sendAccessDenied(telegramUserId: bigint, studentId: string) {
    const plan = await this.paymentsService.getFixedPlan();
    const invoiceMode = process.env.PAYMENT_INVOICE_MODE;

    let invoiceButton: any = { text: `⭐ Pay ${plan.price} Stars (Instant Access)`, callback_data: 'pay_stars' };

    try {
      const invoiceRes = await this.paymentsService.sendStarInvoice(telegramUserId, studentId, false, 'createInvoiceLink');
      if (invoiceRes.ok && invoiceRes.invoiceLink) {
        invoiceButton = { text: `⭐ Pay ${plan.price} Stars (Instant Access)`, url: invoiceRes.invoiceLink };
      }
    } catch (e: any) {
      this.logger.warn(`Failed to generate invoice link: ${e.message}`);
    }

    const message =
      `❌ <b>Access Denied</b>\n\n` +
      `Your All-Access subscription is currently inactive.\n\n` +
      `🎓 <b>Melcome University All-Access</b>\n` +
      `Price: <b>⭐ ${plan.price} Stars</b> (30 Days)\n\n` +
      `<i>Pay natively using Telegram Stars below to get instant access to all Videos, Audios, and Notes.</i>`;

    const replyMarkup = {
      inline_keyboard: [
        [invoiceButton],
        [{ text: '🔄 Check Subscription Status', callback_data: 'check_subscription' }],
      ],
    };

    await this.sendMessage(telegramUserId, message, 'HTML', replyMarkup, studentId);

    if (invoiceMode === 'sendInvoice') {
      await this.paymentsService.sendStarInvoice(telegramUserId, studentId, false, 'sendInvoice');
    }
  }

  async sendSuspensionNotification(studentId: string, reason?: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { subscriptions: { orderBy: { created_at: 'desc' } } }
    });
    if (!student) return;

    const now = new Date();
    const hasValidFutureSub = student.subscriptions.some(
      sub => sub.current_period_end && sub.current_period_end > now
    );
    
    if (!hasValidFutureSub) {
      this.logger.log(`Student ${studentId} is expired. Skipping suspension notification.`);
      return;
    }

    const message = `⚠️ <b>Account Suspended</b>\n\nYour access to Melcome University has been temporarily suspended.${reason ? `\n\n<b>Reason:</b> ${reason}` : ''}\n\nDo you acknowledge this suspension and wish to reactivate your account?`;

    const replyMarkup = {
      inline_keyboard: [
        [{ text: '✅ Yes, reactivate my account', callback_data: 'suspend_yes' }],
        [{ text: '❌ No, remain suspended', callback_data: 'suspend_no' }],
      ],
    };

    await this.sendMessage(student.telegram_user_id.toString(), message, 'HTML', replyMarkup, student.id);
  }

  async setBotCommands() {
    const token = this.getBotToken();
    if (!token) return;

    try {
      await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'start', description: 'Open Main Menu' },
            { command: 'courses', description: 'Browse Courses' },
            { command: 'latest', description: 'Latest Courses' },
            { command: 'account', description: 'Account & Subscription' },
            { command: 'help', description: 'Help & FAQ' },
            { command: 'clear', description: 'Clear Chat History' },
          ],
        }),
      });

      await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: { type: 'commands' },
        }),
      });
    } catch (err: any) {
      this.logger.warn(`Failed to set Telegram bot commands: ${err.message}`);
    }
  }

  private async handleMenuCommand(student: any, text: string, incomingMessageId?: number) {
    const telegramUserId = student.telegram_user_id;

    // Track user's message so clear chat deletes it too
    if (incomingMessageId) {
      this.trackSentMessage(telegramUserId.toString(), incomingMessageId, student.id);
    }

    const trimmed = (text || '').trim();

    // Check for Sales Agent activation link: /start act_<token>
    if (trimmed.startsWith('/start act_') || trimmed.startsWith('/start act')) {
      const tokenMatch = trimmed.match(/\/start\s+act_([a-zA-Z0-9_-]+)/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        const activationResult = await this.serviceBridge.activateStudentFromToken(
          telegramUserId,
          token,
          {
            username: student.username || undefined,
            firstName: student.first_name || undefined,
            lastName: student.last_name || undefined,
          },
        );

        if (activationResult.success) {
          const welcomeText =
            `🎉 <b>Account Activated Successfully!</b>\n\n` +
            `Welcome to <b>${activationResult.bundleName}</b>!\n\n` +
            `✅ Your course subscription has been unlocked. You now have full access to all Video lessons, Audio briefings, and Study notes.\n\n` +
            `Use the menu below to start learning right away:`;

          const menuResponse = await this.routerService.handleRoute('/start', student.id);
          await this.sendMessage(
            telegramUserId,
            welcomeText,
            'HTML',
            menuResponse.replyMarkup,
            student.id,
          );
          return;
        } else {
          await this.sendMessage(
            telegramUserId,
            `⚠️ <b>Activation Notice:</b>\n\n${activationResult.message}`,
            'HTML',
            undefined,
            student.id,
          );
          return;
        }
      }
    }

    const sub = await this.getActiveSubscription(student.id);
    if (!sub) {
      if (student.is_active === false) {
        const now = new Date();
        const hasValidFutureSub = await this.prisma.subscription.findFirst({
           where: { student_id: student.id, current_period_end: { gt: now } }
        });
        
        if (hasValidFutureSub) {
          await this.sendSuspensionNotification(student.id);
          return;
        }
      }

      this.logger.log(`Unauthorized interaction from student ${student.id} without active subscription.`);
      await this.sendAccessDenied(telegramUserId, student.id);
      return;
    }

    let session = this.studentSessions.get(student.id);
    if (!session) {
      session = this.touchSession(student.id, telegramUserId, telegramUserId.toString());
    }
    if (!session.navState) {
      session.navState = { module: 'main' };
    }

    // 1. Clear Chat (Wipes chat completely and shows only START button)
    if (trimmed.includes('Clear Chat') || trimmed === '/clear') {
      await this.clearChatCompletely(session, telegramUserId, incomingMessageId);
      return;
    }

    // 2. Main Menu / Start (Restores welcome message & full 6-button keyboard)
    if (
      trimmed === '🏠 Main Menu' ||
      trimmed === '/start' ||
      trimmed === 'Main Menu' ||
      trimmed.toUpperCase() === 'START' ||
      trimmed === '🚀 START' ||
      trimmed.startsWith('/start')
    ) {
      session.navState = { module: 'main' };
      const response = await this.routerService.handleRoute('/start', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    // 3. Top-Level Module Selectors
    if (trimmed.includes('Latest Course') || trimmed === '/latest') {
      session.navState = { module: 'latest', step: 'format' };
      const response = await this.routerService.handleRoute('nav:latest', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    if (trimmed.includes('Courses') || trimmed === '/courses') {
      session.navState = { module: 'courses', step: 'format' };
      const response = await this.routerService.handleRoute('nav:courses', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    if (trimmed === '/categories') {
      session.navState = { module: 'courses', step: 'format' };
      const response = await this.routerService.handleRoute('nav:courses', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    if (trimmed.includes('Account') || trimmed === '/account') {
      session.navState = { module: 'account' };
      const response = await this.routerService.handleRoute('nav:account', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    if (trimmed.includes('Help') || trimmed === '/help') {
      session.navState = { module: 'help' };
      const response = await this.routerService.handleRoute('nav:help', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    // 4. Format Selection (🎬 Video, 🎧 Audio, 📄 Text)
    const isVideo = trimmed.includes('Video') || trimmed === '🎬 Video';
    const isAudio = trimmed.includes('Audio') || trimmed === '🎧 Audio';
    const isText = trimmed.includes('Text') || trimmed === '📄 Text';

    if (isVideo || isAudio || isText) {
      const format: 'VIDEO' | 'AUDIO' | 'TEXT' = isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : 'TEXT';
      const mod = session.navState?.module || 'latest';

      if (mod === 'categories') {
        session.navState = { module: 'categories', step: 'category', format };
        const response = await this.routerService.handleRoute(`nav:categories:${format.toLowerCase()}`, student.id);
        await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
        return;
      } else if (mod === 'courses') {
        session.navState = { module: 'courses', step: 'items', format };
        const response = await this.routerService.handleRoute(`nav:courses:${format.toLowerCase()}`, student.id);
        await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
        return;
      } else {
        session.navState = { module: 'latest', step: 'items', format };
        const response = await this.routerService.handleRoute(`nav:latest:${format.toLowerCase()}`, student.id);
        await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
        return;
      }
    }

    // 5. Previous / Back Navigation
    if (trimmed.includes('Previous') || trimmed.includes('Back')) {
      const nav = session.navState || { module: 'main' };

      if (nav.module === 'categories') {
        if (nav.step === 'items') {
          nav.step = 'category';
          const fmt = nav.format || 'VIDEO';
          const response = await this.routerService.handleRoute(`nav:categories:${fmt.toLowerCase()}`, student.id);
          await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
          return;
        } else if (nav.step === 'category') {
          nav.step = 'format';
          const response = await this.routerService.handleRoute('nav:categories', student.id);
          await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
          return;
        } else {
          session.navState = { module: 'main' };
          const response = await this.routerService.handleRoute('/start', student.id);
          await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
          return;
        }
      } else if (nav.module === 'courses') {
        if (nav.step === 'items') {
          nav.step = 'format';
          const response = await this.routerService.handleRoute('nav:courses', student.id);
          await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
          return;
        } else {
          session.navState = { module: 'main' };
          const response = await this.routerService.handleRoute('/start', student.id);
          await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
          return;
        }
      } else if (nav.module === 'latest') {
        if (nav.step === 'items') {
          nav.step = 'format';
          const response = await this.routerService.handleRoute('nav:latest', student.id);
          await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
          return;
        } else {
          session.navState = { module: 'main' };
          const response = await this.routerService.handleRoute('/start', student.id);
          await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
          return;
        }
      } else {
        session.navState = { module: 'main' };
        const response = await this.routerService.handleRoute('/start', student.id);
        await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
        return;
      }
    }

    if (
      trimmed.includes('Subscription') ||
      trimmed.includes('Renew') ||
      trimmed === '/renew'
    ) {
      const plan = await this.paymentsService.getFixedPlan();
      const invoiceMode = process.env.PAYMENT_INVOICE_MODE;

      let invoiceButton: any = null;
      if (invoiceMode === 'createInvoiceLink') {
        const invoiceRes = await this.paymentsService.sendStarInvoice(telegramUserId, student.id, true, 'createInvoiceLink');
        if (invoiceRes.ok && invoiceRes.invoiceLink) {
          invoiceButton = { text: `⭐ Renew (${plan.price} Stars)`, url: invoiceRes.invoiceLink };
        }
      }

      const responseText =
        `💳 <b>Renew Subscription</b>\n\n` +
        `Extend your access for another 30 days.\n\n` +
        `Price: <b>⭐ ${plan.price} Stars</b>\n\n` +
        `<i>Pay the Telegram Stars invoice below. Your extra 30 days will stack seamlessly onto your current validity!</i>`;

      const replyMarkup = invoiceButton
        ? { inline_keyboard: [[invoiceButton]] }
        : undefined;

      await this.sendMessage(telegramUserId, responseText, 'HTML', replyMarkup, student.id);

      if (invoiceMode !== 'createInvoiceLink') {
        await this.paymentsService.sendStarInvoice(telegramUserId, student.id, true, 'sendInvoice');
      }
      return;
    }

    if (trimmed.includes('Validity')) {
      const response = await this.routerService.handleRoute('nav:account:validity', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    // 7. Help Options
    if (trimmed.includes('Release Date')) {
      const response = await this.routerService.handleRoute('nav:help:release', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    if (trimmed.includes('Refund')) {
      const response = await this.routerService.handleRoute('nav:help:refund', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    if (trimmed.includes('Terms') || trimmed.includes('Policy')) {
      const response = await this.routerService.handleRoute('nav:help:terms', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    // 8. Category Selection (when browsing categories)
    if (session.navState?.module === 'categories' && session.navState?.step === 'category') {
      const cat = await this.prisma.category.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' } },
      });
      if (cat) {
        session.navState.step = 'items';
        session.navState.categoryId = cat.id;
        session.navState.categoryName = cat.name;
        const fmt = session.navState.format || 'VIDEO';
        const response = await this.routerService.handleRoute(`nav:categories:${fmt.toLowerCase()}:${cat.id}`, student.id);
        await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
        return;
      }
    }

    // 9. Content Item Selection (Course clicked -> deliver to chat!)
    const content = await this.prisma.content.findFirst({
      where: {
        title: { equals: trimmed, mode: 'insensitive' },
        status: 'PUBLISHED',
      },
    });

    if (content) {
      const response = await this.routerService.handleRoute(`content:${content.id}`, student.id);
      if (response.mediaType === 'VIDEO' && response.mediaUrl) {
        await this.sendVideo(
          telegramUserId,
          response.mediaUrl,
          response.text,
          response.replyMarkup,
          student.id,
        );
      } else if (response.mediaType === 'AUDIO' && response.mediaUrl) {
        await this.sendAudio(
          telegramUserId,
          response.mediaUrl,
          response.text,
          content.title,
          response.replyMarkup,
          student.id,
        );
      } else {
        await this.sendMessage(
          telegramUserId,
          response.text,
          'HTML',
          response.replyMarkup,
          student.id,
        );
      }
      return;
    }

    // Fallback: Show Main Menu
    const response = await this.routerService.handleRoute('/start', student.id);
    await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
  }

  private async handleCallbackQuery(student: any, data: string) {
    const telegramUserId = student.telegram_user_id;

    if (data === 'nav:clear_chat') {
      const session = this.studentSessions.get(student.id);
      if (session) {
        await this.clearChatCompletely(session, telegramUserId);
      }
      return;
    }

    if (data === 'suspend_yes') {
      await this.paymentsService.updateStudentStatus(student.id, 'ACTIVE');
      await this.sendMessage(telegramUserId, "✅ Your account has been reactivated successfully.", 'HTML', undefined, student.id);
      const session = this.studentSessions.get(student.id);
      if (session) {
        session.navState = { module: 'main' };
      }
      const response = await this.routerService.handleRoute('/start', student.id);
      await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      return;
    }

    if (data === 'suspend_no') {
      await this.sendMessage(telegramUserId, "🚫 Your suspension remains active.", 'HTML', undefined, student.id);
      await this.sendSuspensionNotification(student.id); // loop as requested
      return;
    }

    if (data === 'pay_stars' || data === 'renew_stars') {
      const isRenewal = data === 'renew_stars';
      const plan = await this.paymentsService.getFixedPlan();
      const invoiceRes = await this.paymentsService.sendStarInvoice(telegramUserId, student.id, isRenewal, 'createInvoiceLink');

      if (invoiceRes.ok && invoiceRes.invoiceLink) {
        const text = isRenewal
          ? `💳 <b>Renew Subscription</b>\n\nTap below to complete your ⭐ <b>${plan.price} Stars</b> payment:`
          : `⭐ <b>All-Access Subscription</b>\n\nTap below to complete your ⭐ <b>${plan.price} Stars</b> payment:`;

        await this.sendMessage(
          telegramUserId,
          text,
          'HTML',
          {
            inline_keyboard: [
              [{ text: `⭐ Pay ${plan.price} Stars Now`, url: invoiceRes.invoiceLink }],
            ],
          },
          student.id,
        );
      } else {
        await this.paymentsService.sendStarInvoice(telegramUserId, student.id, isRenewal, 'sendInvoice');
      }
      return;
    }

    if (data === 'check_subscription') {
      const sub = await this.getActiveSubscription(student.id);
      if (sub) {
        await this.sendMessage(
          telegramUserId,
          `✅ <b>Subscription Active!</b>\n\nYour Melcome University All-Access membership is verified.`,
          'HTML',
          undefined,
          student.id,
        );
        const response = await this.routerService.handleRoute('/start', student.id);
        await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
      } else {
        await this.sendAccessDenied(telegramUserId, student.id);
      }
      return;
    }

    const sub = await this.getActiveSubscription(student.id);
    if (!sub) {
      await this.sendAccessDenied(telegramUserId, student.id);
      return;
    }

    const response = await this.routerService.handleRoute(data, student.id);
    await this.sendMessage(telegramUserId, response.text, 'HTML', response.replyMarkup, student.id);
  }
}
