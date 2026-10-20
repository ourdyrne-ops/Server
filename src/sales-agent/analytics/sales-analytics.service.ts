import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FunnelEventType } from '../interfaces/sales.interfaces.js';

export interface FunnelMetricsSummary {
  leadsTriggered: number;
  languagesSelected: Record<string, number>;
  customerTypeBreakdown: {
    newCustomers: number;
    existingCustomers: number;
  };
  bundleViews: number;
  faqViews: number;
  checkoutStarts: number;
  successfulPayments: number;
  provisioningCompleted: number;
  activationCompleted: number;
  renewalConverted: number;
  refundsRequested: number;
  totalStarsRevenue: number;
  conversionRateCheckoutToPaid: number;
  conversionRateLeadToPaid: number;
}

@Injectable()
export class SalesAnalyticsService {
  private readonly logger = new Logger(SalesAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(
    eventType: FunnelEventType,
    options: {
      sessionId?: string;
      campaignId?: string;
      telegramUserId?: bigint | number;
      metadata?: Record<string, any>;
    } = {}
  ) {
    try {
      const { sessionId, campaignId, telegramUserId, metadata } = options;
      await this.prisma.salesFunnelEvent.create({
        data: {
          event_type: eventType,
          session_id: sessionId,
          campaign_id: campaignId,
          telegram_user_id: telegramUserId ? BigInt(telegramUserId) : undefined,
          metadata: metadata || {},
        },
      });

      this.logger.log(
        `[FunnelEvent] ${eventType} recorded for user ${telegramUserId || 'anon'} (session: ${sessionId || 'none'})`
      );
    } catch (err: any) {
      this.logger.error(`Failed to record funnel event ${eventType}: ${err.message}`, err.stack);
    }
  }

  async getFunnelMetrics(): Promise<FunnelMetricsSummary> {
    const events = await this.prisma.salesFunnelEvent.findMany({
      orderBy: { created_at: 'desc' },
      take: 5000,
    });

    const paidOrders = await this.prisma.salesOrder.findMany({
      where: { status: { in: ['PAID', 'PROVISIONED', 'ACTIVATED'] } },
      select: { amount_stars: true },
    });

    const totalStars = paidOrders.reduce((sum, o) => sum + o.amount_stars, 0);

    const counts: Record<string, number> = {};
    const languages: Record<string, number> = {};
    let newCust = 0;
    let existCust = 0;

    for (const e of events) {
      counts[e.event_type] = (counts[e.event_type] || 0) + 1;
      const meta = (e.metadata as any) || {};

      if (e.event_type === FunnelEventType.LANGUAGE_SELECTED && meta.language) {
        languages[meta.language] = (languages[meta.language] || 0) + 1;
      }
      if (e.event_type === FunnelEventType.CUSTOMER_TYPE_SELECTED) {
        if (meta.customerType === 'NEW_CUSTOMER') newCust++;
        if (meta.customerType === 'EXISTING_CUSTOMER') existCust++;
      }
    }

    const leads = counts[FunnelEventType.LEAD_TRIGGERED] || 0;
    const checkouts = counts[FunnelEventType.CHECKOUT_INITIATED] || 0;
    const paid = counts[FunnelEventType.PAYMENT_SUCCESS] || paidOrders.length;
    const provisioning = counts[FunnelEventType.PROVISIONING_COMPLETED] || 0;
    const activation = counts[FunnelEventType.ACTIVATION_COMPLETED] || 0;
    const renewal = counts[FunnelEventType.RENEWAL_CONVERTED] || 0;
    const refunds = counts[FunnelEventType.REFUND_REQUESTED] || 0;

    const conversionRateCheckoutToPaid =
      checkouts > 0 ? Number(((paid / checkouts) * 100).toFixed(2)) : 0;
    const conversionRateLeadToPaid =
      leads > 0 ? Number(((paid / leads) * 100).toFixed(2)) : 0;

    return {
      leadsTriggered: leads,
      languagesSelected: languages,
      customerTypeBreakdown: {
        newCustomers: newCust,
        existingCustomers: existCust,
      },
      bundleViews: counts[FunnelEventType.BUNDLE_VIEWED] || 0,
      faqViews: counts[FunnelEventType.FAQ_VIEWED] || 0,
      checkoutStarts: checkouts,
      successfulPayments: paid,
      provisioningCompleted: provisioning,
      activationCompleted: activation,
      renewalConverted: renewal,
      refundsRequested: refunds,
      totalStarsRevenue: totalStars,
      conversionRateCheckoutToPaid,
      conversionRateLeadToPaid,
    };
  }
}
