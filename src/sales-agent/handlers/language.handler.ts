import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FunnelEventType,
  InlineKeyboardMarkup,
  SalesConversationState,
  TelegramCallbackQuery,
} from '../interfaces/sales.interfaces.js';
import { SUPPORTED_LANGUAGES } from '../localization/languages.config.js';
import { getTranslation } from '../localization/translations.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';

@Injectable()
export class LanguageHandler {
  private readonly logger = new Logger(LanguageHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  buildLanguageKeyboard(): InlineKeyboardMarkup {
    const rows = [];
    for (let i = 0; i < SUPPORTED_LANGUAGES.length; i += 2) {
      const row = [];
      const lang1 = SUPPORTED_LANGUAGES[i];
      row.push({
        text: `${lang1.flag} ${lang1.nativeName}`,
        callback_data: `lang_${lang1.code}`,
      });
      if (i + 1 < SUPPORTED_LANGUAGES.length) {
        const lang2 = SUPPORTED_LANGUAGES[i + 1];
        row.push({
          text: `${lang2.flag} ${lang2.nativeName}`,
          callback_data: `lang_${lang2.code}`,
        });
      }
      rows.push(row);
    }
    return { inline_keyboard: rows };
  }

  async sendLanguagePrompt(
    chatId: string | number,
    session: any,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const lang = session?.language || 'en';
    const t = getTranslation(lang);

    const text = `👋 <b>Melcome University Sales Agent</b>\n\n${t.selectLanguage}`;
    const keyboard = this.buildLanguageKeyboard();

    await this.prisma.salesSession.update({
      where: { id: session.id },
      data: {
        current_state: SalesConversationState.LANGUAGE_SELECTION,
        last_active_at: new Date(),
      },
    });

    await sendMessageFn(chatId, text, keyboard);
  }

  async processLanguageCallback(
    callbackQuery: TelegramCallbackQuery,
    session: any,
    onLanguageSelected: (newLang: string, session: any) => Promise<any>
  ) {
    const data = callbackQuery.data || '';
    const langCode = data.replace('lang_', '');

    this.logger.log(`User ${callbackQuery.from.id} selected language: ${langCode}`);

    const updatedSession = await this.prisma.salesSession.update({
      where: { id: session.id },
      data: {
        language: langCode,
        current_state: SalesConversationState.CUSTOMER_TYPE,
        last_active_at: new Date(),
      },
      include: { bundle: true, campaign: true },
    });

    await this.analytics.trackEvent(FunnelEventType.LANGUAGE_SELECTED, {
      sessionId: session.id,
      campaignId: session.campaign_id || undefined,
      telegramUserId: session.telegram_user_id,
      metadata: { language: langCode },
    });

    await onLanguageSelected(langCode, updatedSession);
  }
}
