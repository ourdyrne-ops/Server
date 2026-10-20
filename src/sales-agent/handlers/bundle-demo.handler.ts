import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FunnelEventType,
  InlineKeyboardMarkup,
  SalesConversationState,
} from '../interfaces/sales.interfaces.js';
import { getTranslation } from '../localization/translations.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';

@Injectable()
export class BundleDemoHandler {
  private readonly logger = new Logger(BundleDemoHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  async renderBundleDemo(
    chatId: string | number,
    session: any,
    bundleIdOrSlug?: string,
    sendMessageFn?: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const lang = session.language || 'en';
    const t = getTranslation(lang);

    // Fetch bundle from database
    let bundle = null;
    if (bundleIdOrSlug) {
      bundle = await this.prisma.courseBundle.findFirst({
        where: {
          OR: [{ id: bundleIdOrSlug }, { slug: bundleIdOrSlug }],
          is_active: true,
        },
        include: {
          bundle_items: {
            include: { content: true },
          },
        },
      });
    }

    if (!bundle && session.bundle_id) {
      bundle = await this.prisma.courseBundle.findUnique({
        where: { id: session.bundle_id },
        include: {
          bundle_items: {
            include: { content: true },
          },
        },
      });
    }

    if (!bundle) {
      bundle = await this.prisma.courseBundle.findFirst({
        where: { is_active: true },
        include: {
          bundle_items: {
            include: { content: true },
          },
        },
      });
    }

    if (!bundle) {
      throw new Error('No active course bundles available in database');
    }

    // Update session bundle_id and state
    await this.prisma.salesSession.update({
      where: { id: session.id },
      data: {
        bundle_id: bundle.id,
        current_state: SalesConversationState.BUNDLE_DETAILS,
        last_active_at: new Date(),
      },
    });

    await this.analytics.trackEvent(FunnelEventType.BUNDLE_VIEWED, {
      sessionId: session.id,
      campaignId: session.campaign_id || undefined,
      telegramUserId: session.telegram_user_id,
      metadata: { bundleId: bundle.id, slug: bundle.slug, priceStars: bundle.price_stars },
    });

    // Format courses included
    const coursesList = (bundle.bundle_items || [])
      .map((item) => {
        const c = item.content;
        const icon = c.media_type === 'VIDEO' ? '🎬' : c.media_type === 'AUDIO' ? '🎧' : '📝';
        return `  ${icon} <i>${c.title}</i>`;
      })
      .slice(0, 6)
      .join('\n');

    const benefits = Array.isArray(bundle.benefits)
      ? (bundle.benefits as string[]).map((b) => `  ✅ ${b}`).join('\n')
      : '';

    const outcomes = Array.isArray(bundle.outcomes)
      ? (bundle.outcomes as string[]).map((o) => `  🎯 ${o}`).join('\n')
      : '';

    const text = `<b>${t.bundleOverviewTitle}</b>\n\n` +
      `🎓 <b>${bundle.name}</b>\n` +
      `<i>${bundle.description}</i>\n\n` +
      `💰 <b>${t.bundlePriceLabel}:</b> ⭐ <b>${bundle.price_stars} Telegram Stars (XTR)</b>\n` +
      `⏳ <b>${t.bundleDurationLabel}:</b> ${bundle.duration_days} Days Full Access\n\n` +
      `📚 <b>${t.coursesIncludedLabel}:</b>\n${coursesList}\n\n` +
      `✨ <b>${t.bundleBenefitsLabel}:</b>\n${benefits}\n\n` +
      `🚀 <b>${t.bundleOutcomesLabel}:</b>\n${outcomes}\n\n` +
      `💡 <i>Instant delivery inside @melcome_university_bot immediately upon payment.</i>`;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: `⭐ ${t.buyNowBtn.replace('Buy Now with Telegram Stars', `Buy Now (${bundle.price_stars} Stars)`)}`,
            callback_data: `buy_${bundle.id}`,
          },
        ],
        [
          { text: t.faqBtn, callback_data: 'nav_faq' },
          { text: '🔄 Other Bundles', callback_data: 'nav_bundles' },
        ],
        [
          { text: t.backBtn, callback_data: 'nav_cust_type' },
          { text: t.switchLanguageBtn, callback_data: 'nav_lang' },
        ],
      ],
    };

    if (sendMessageFn) {
      await sendMessageFn(chatId, text, keyboard);
    }

    return { bundle, text, keyboard };
  }

  async renderBundlesList(
    chatId: string | number,
    session: any,
    sendMessageFn: (chatId: string | number, text: string, keyboard?: InlineKeyboardMarkup) => Promise<any>
  ) {
    const lang = session.language || 'en';
    const t = getTranslation(lang);

    const bundles = await this.prisma.courseBundle.findMany({
      where: { is_active: true },
      orderBy: { price_stars: 'desc' },
    });

    const text = `<b>🌟 Explore All Course Bundles</b>\n\nChoose a bundle below to see full syllabus, curriculum, and pricing:`;

    const buttons = bundles.map((b) => [
      {
        text: `📦 ${b.name} (⭐ ${b.price_stars} Stars)`,
        callback_data: `view_bnd_${b.id}`,
      },
    ]);

    buttons.push([{ text: t.backBtn, callback_data: 'nav_bundle_current' }]);

    await sendMessageFn(chatId, text, { inline_keyboard: buttons });
  }
}
