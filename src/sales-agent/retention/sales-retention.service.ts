import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ServiceBotBridgeService } from '../service-bridge/service-bot-bridge.service.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';
import { FunnelEventType } from '../interfaces/sales.interfaces.js';

@Injectable()
export class SalesRetentionService {
  private readonly logger = new Logger(SalesRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceBridge: ServiceBotBridgeService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  getSalesBotToken(): string {
    return (
      process.env.SALES_BOT_TOKEN ||
      '8891888818:AAFQ4Q_HFXSO6QC4KbuRJ39z-vi8JC6-gOk'
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processDueRetentionEvents() {
    const now = new Date();
    const dueEvents = await this.prisma.retentionSchedule.findMany({
      where: {
        scheduled_at: { lte: now },
        status: 'SCHEDULED',
      },
      take: 50,
      orderBy: { scheduled_at: 'asc' },
    });

    if (dueEvents.length === 0) return;

    this.logger.log(`Processing ${dueEvents.length} due retention events`);

    for (const event of dueEvents) {
      try {
        await this.dispatchRetentionNotification(event);

        await this.prisma.retentionSchedule.update({
          where: { id: event.id },
          data: {
            status: 'SENT',
            sent_at: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to dispatch retention event ${event.id} (${event.event_type}): ${err.message}`
        );
        await this.prisma.retentionSchedule.update({
          where: { id: event.id },
          data: {
            status: 'FAILED',
            metadata: { error: err.message },
          },
        });
      }
    }
  }

  private async dispatchRetentionNotification(event: any) {
    const tgUserId = event.telegram_user_id.toString();
    const botUsername = this.serviceBridge.getServiceBotUsername();

    let text = '';
    let keyboard: any = undefined;

    switch (event.event_type) {
      case 'ONBOARDING_WELCOME':
        text = `🎉 <b>Welcome to Your Learning Journey!</b>\n\nYour course access is fully active in @${botUsername}.\n\nReady to dive into your first lesson? Click below to resume learning:`;
        keyboard = {
          inline_keyboard: [
            [{ text: '📚 Open University Courses', url: `https://t.me/${botUsername}` }],
          ],
        };
        break;

      case 'COURSE_START_REMINDER':
        text = `💡 <b>Quick Momentum Check!</b>\n\nConsistent daily learning builds mastery. Jump into today's bite-sized lesson in @${botUsername}:`;
        keyboard = {
          inline_keyboard: [
            [{ text: '▶️ Continue Lessons', url: `https://t.me/${botUsername}` }],
          ],
        };
        break;

      case 'EXPIRY_REMINDER_7D':
        text = `⏳ <b>Subscription Notice: 7 Days Remaining</b>\n\nYour course subscription will renew or expire in 7 days. Renew now to avoid losing access to your saved course notes and video progress!`;
        keyboard = {
          inline_keyboard: [
            [{ text: '⭐ Renew Access with Stars', callback_data: 'sales_renew_prompt' }],
            [{ text: '📚 Access Lessons', url: `https://t.me/${botUsername}` }],
          ],
        };
        break;

      case 'EXPIRY_REMINDER_3D':
        text = `⚠️ <b>3 Days Left of Course Access</b>\n\nYour access to all masterclasses in @${botUsername} will end in 3 days. Renew today using Telegram Stars:`;
        keyboard = {
          inline_keyboard: [
            [{ text: '⭐ Renew Now', callback_data: 'sales_renew_prompt' }],
          ],
        };
        break;

      case 'EXPIRY_REMINDER_1D':
        text = `🚨 <b>Final Reminder: Access Expires Tomorrow!</b>\n\nKeep your uninterrupted access to all video, audio, and text lessons. Tap below to renew:`;
        keyboard = {
          inline_keyboard: [
            [{ text: '⭐ Renew Instantly with Stars', callback_data: 'sales_renew_prompt' }],
          ],
        };
        break;

      default:
        text = `🔔 <b>University Notification</b>\n\nNew updates are available in your learning bot @${botUsername}!`;
        keyboard = {
          inline_keyboard: [
            [{ text: 'Open Courses', url: `https://t.me/${botUsername}` }],
          ],
        };
    }

    await this.sendMessageToUser(tgUserId, text, keyboard);
  }

  private async sendMessageToUser(chatId: string, text: string, replyMarkup?: any) {
    const token = this.getSalesBotToken();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });

    const data = (await res.json()) as any;
    if (!data.ok) {
      throw new Error(`Telegram sendMessage failed: ${data.description}`);
    }
  }
}
