import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FunnelEventType,
  InlineKeyboardMarkup,
  SalesConversationState,
  TelegramMessage,
} from '../interfaces/sales.interfaces.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';
import { getTranslation } from '../localization/translations.js';

@Injectable()
export class TriggerHandler {
  private readonly logger = new Logger(TriggerHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  getSalesBotUsername(): string {
    return process.env.SALES_BOT_USERNAME || 'melcome_sales_bot';
  }

  isGroupTrigger(message: TelegramMessage): boolean {
    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';
    if (!isGroup) return false;

    const text = (message.text || '').toLowerCase().trim();
    const botUser = this.getSalesBotUsername().toLowerCase();

    return (
      text.startsWith('/course') ||
      text.startsWith('/buy') ||
      text.startsWith('/offer') ||
      text.startsWith('/bundle') ||
      text.includes(`@${botUser}`) ||
      text.startsWith('!course') ||
      text.includes('course price') ||
      text.includes('enroll')
    );
  }

  async handleGroupTrigger(
    message: TelegramMessage,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const groupChatId = message.chat.id.toString();
    const fromUser = message.from;
    const tgUserId = fromUser ? BigInt(fromUser.id) : undefined;
    const botUser = this.getSalesBotUsername();

    this.logger.log(`Marketing trigger matched in group ${groupChatId} from user ${tgUserId}`);

    // Find campaign associated with this group chat or fall back to default 'alpha'
    let campaign = await this.prisma.salesCampaign.findFirst({
      where: {
        OR: [
          { group_chat_id: groupChatId, is_active: true },
          { code: 'alpha', is_active: true },
        ],
      },
      include: { bundle: true },
    });

    const campaignCode = campaign?.code || 'alpha';
    const bundleSlug = campaign?.bundle?.slug || 'all_access_mastery';

    await this.analytics.trackEvent(FunnelEventType.LEAD_TRIGGERED, {
      campaignId: campaign?.id,
      telegramUserId: tgUserId,
      metadata: {
        groupChatId,
        groupTitle: message.chat.title,
        triggerText: message.text,
      },
    });

    const firstName = fromUser?.first_name ? ` ${fromUser.first_name}` : '';
    const t = getTranslation('en');

    const deepLink = `https://t.me/${botUser}?start=cmp_${campaignCode}_bnd_${bundleSlug}`;

    const text = `👋 Hello${firstName}!\n\n${t.groupTeaserText}\n\n• <b>13+ Flagship Masterclasses</b> (AI, B2B Sales, Bots, UI/UX)\n• <b>Instant Telegram Streaming</b>\n• <b>Verified Certificates & Mentorship</b>`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: t.groupTeaserBtn,
            url: deepLink,
          },
        ],
      ],
    };

    await sendMessageFn(message.chat.id, text, keyboard);
  }

  parseStartPayload(text: string = ''): { campaignCode?: string; bundleSlug?: string } {
    const match = text.match(/^\/start\s+cmp_([a-zA-Z0-9_-]+)_bnd_([a-zA-Z0-9_-]+)/i);
    if (match) {
      return {
        campaignCode: match[1],
        bundleSlug: match[2],
      };
    }
    return {};
  }
}
